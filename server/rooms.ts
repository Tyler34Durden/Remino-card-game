import { randomBytes, randomInt } from "node:crypto";
import type { GameAction, PublicRoomState, PublicSeat, RoomSettings, SessionInfo } from "../shared/types.ts";
import { botViewOf, chooseBotAction, fallbackBotAction } from "../engine/bot.ts";
import { applyAction, applyLateJoin, createMatch, endMatchEarly, startNextRound, uniqueLowestSeat, validateSettings } from "../engine/game.ts";
import type { ActionResult, MatchState } from "../engine/game.ts";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const done: Result = { ok: true, data: undefined };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const BOT_NAMES = ["Salem", "Hamza", "Faraj", "Mansour", "Younes", "Khalifa"];
const MAX_LOG_LINES = 40;
const MAX_BOT_STEPS_PER_TURN = 40;

export interface RoomOptions {
  /** Pause before each bot action, so humans can follow the game. */
  botDelayMs: number;
  /** How long a disconnected player has before a bot takes over. */
  reconnectGraceMs: number;
  /** How long a disconnected host has before the room closes. */
  hostGraceMs: number;
  /** Idle rooms with nobody connected are removed after this long. */
  emptyRoomTtlMs: number;
  maxRooms: number;
  seed: () => number;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = {
  botDelayMs: 900,
  reconnectGraceMs: 30_000,
  hostGraceMs: 120_000,
  emptyRoomTtlMs: 10 * 60_000,
  maxRooms: 500,
  seed: () => randomInt(0, 2 ** 31 - 1),
};

interface Player {
  id: string;
  name: string;
  token: string;
  isHost: boolean;
  connected: boolean;
  /** Seat held now, or null for a late joiner who is still waiting. */
  seat: number | null;
  /** Seat a waiting late joiner takes when the next round starts. */
  reservedSeat: number | null;
  botControlled: boolean;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface SeatSlot {
  kind: "empty" | "human" | "bot";
  playerId: string | null;
  botName: string;
}

export interface Room {
  code: string;
  status: "lobby" | "playing" | "round-end" | "match-end";
  settings: RoomSettings;
  seats: SeatSlot[];
  players: Map<string, Player>;
  match: MatchState | null;
  log: string[];
  version: number;
  botTimer: ReturnType<typeof setTimeout> | null;
  botSteps: { turn: number; count: number };
  lastActivity: number;
}

export interface RoomEvents {
  onUpdate: (room: Room) => void;
  onClosed: (room: Room, reason: string) => void;
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Drop control characters, collapse whitespace, and cap the length.
  const name = raw.replace(/\p{Cc}/gu, "").replace(/\s+/g, " ").trim().slice(0, 20);
  return name.length > 0 ? name : null;
}

function newCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return code;
}

function newId(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

/** Owns every room. All game state lives here, and clients only ever receive views of it. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly options: RoomOptions;
  private readonly events: RoomEvents;

  constructor(events: RoomEvents, options: Partial<RoomOptions> = {}) {
    this.events = events;
    this.options = { ...DEFAULT_ROOM_OPTIONS, ...options };
  }

  // -------------------------------------------------------------------------
  // Rooms and players
  // -------------------------------------------------------------------------

  createRoom(rawName: unknown, settings: RoomSettings): Result<SessionInfo> {
    const name = cleanName(rawName);
    if (!name) return fail("Enter a display name.");
    const problem = validateSettings(settings);
    if (problem) return fail(problem);
    if (this.rooms.size >= this.options.maxRooms) return fail("The server is full. Try again later.");
    let code = newCode();
    while (this.rooms.has(code)) code = newCode();
    const room: Room = {
      code,
      status: "lobby",
      settings: { ...settings },
      seats: this.emptySeats(settings.seatCount),
      players: new Map(),
      match: null,
      log: [],
      version: 1,
      botTimer: null,
      botSteps: { turn: -1, count: 0 },
      lastActivity: Date.now(),
    };
    this.rooms.set(code, room);
    const host = this.addPlayer(room, name, true);
    this.seat(room, host, 0);
    this.say(room, `${name} created the room.`);
    this.changed(room);
    return ok(this.sessionOf(room, host));
  }

  joinRoom(rawName: unknown, rawCode: unknown): Result<SessionInfo> {
    const name = cleanName(rawName);
    if (!name) return fail("Enter a display name.");
    const room = this.findRoom(rawCode);
    if (!room) return fail("No room has that code.");
    if ([...room.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return fail("Someone in that room already uses this name.");
    }
    if (room.status === "lobby") {
      const seat = room.seats.findIndex((s) => s.kind === "empty");
      if (seat === -1) return fail("That room is full.");
      const player = this.addPlayer(room, name, false);
      this.seat(room, player, seat);
      this.say(room, `${name} joined.`);
      this.changed(room);
      return ok(this.sessionOf(room, player));
    }
    // Late join: reserve a bot seat and wait for the next round.
    const reserved = new Set([...room.players.values()].map((p) => p.reservedSeat));
    const seat = room.seats.findIndex((s, i) => s.kind === "bot" && !reserved.has(i));
    if (seat === -1) return fail("Every seat in that room is taken by a player.");
    const player = this.addPlayer(room, name, false);
    player.reservedSeat = seat;
    this.say(room, `${name} joined and will take ${room.seats[seat].botName}'s seat next round.`);
    this.changed(room);
    return ok(this.sessionOf(room, player));
  }

  /** Re-attaches a returning player. Control of the seat goes straight back to the human. */
  reconnect(session: unknown): Result<SessionInfo> {
    const found = this.authenticate(session);
    if (!found) return fail("That session is no longer valid.");
    this.markConnected(found.room.code, found.player.id);
    return ok(this.sessionOf(found.room, found.player));
  }

  markConnected(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player) return;
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = null;
    const wasAway = !player.connected || player.botControlled;
    player.connected = true;
    if (player.botControlled) {
      player.botControlled = false;
      this.say(room, `${player.name} is back and has reclaimed the seat.`);
    } else if (wasAway) {
      this.say(room, `${player.name} reconnected.`);
    }
    if (wasAway) this.changed(room);
  }

  markDisconnected(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player || !player.connected) return;
    player.connected = false;
    if (player.graceTimer) clearTimeout(player.graceTimer);
    // A host in the lobby gets the full host grace. During a match a bot covers the seat first.
    const grace = player.isHost && room.status === "lobby" ? this.options.hostGraceMs : this.options.reconnectGraceMs;
    player.graceTimer = setTimeout(() => this.graceExpired(room.code, player.id), grace);
    this.say(room, `${player.name} lost connection.`);
    this.changed(room);
  }

  private graceExpired(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player || player.connected) return;
    player.graceTimer = null;
    if (player.isHost) {
      const extra = this.options.hostGraceMs - this.options.reconnectGraceMs;
      if (room.status !== "lobby" && !player.botControlled && extra > 0) {
        player.botControlled = true;
        player.graceTimer = setTimeout(() => this.graceExpired(room.code, player.id), extra);
        this.say(room, `A bot is playing for ${player.name}. The room closes if the host does not return.`);
        this.changed(room);
        return;
      }
      this.closeRoom(room, "The host left, so the room has closed.");
      return;
    }
    if (room.status === "lobby" || player.seat === null) {
      this.removePlayer(room, player);
      this.say(room, `${player.name} left.`);
    } else {
      player.botControlled = true;
      this.say(room, `A bot is playing for ${player.name} until they return.`);
    }
    this.changed(room);
  }

  reclaimSeat(code: string, playerId: string): Result {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player) return fail("That room no longer exists.");
    if (player.seat === null) return fail("You do not have a seat yet.");
    this.markConnected(code, playerId);
    return done;
  }

  leaveRoom(code: string, playerId: string): Result {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player) return fail("That room no longer exists.");
    if (player.isHost) {
      this.closeRoom(room, "The host left, so the room has closed.");
      return done;
    }
    this.removePlayer(room, player);
    this.say(room, `${player.name} left.`);
    this.changed(room);
    return done;
  }

  // -------------------------------------------------------------------------
  // Host controls
  // -------------------------------------------------------------------------

  updateSettings(code: string, playerId: string, settings: RoomSettings): Result {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player) return fail("That room no longer exists.");
    if (!player.isHost) return fail("Only the host can change the settings.");
    if (room.status !== "lobby") return fail("Settings are locked once the match begins.");
    const problem = validateSettings(settings);
    if (problem) return fail(problem);
    const humans = room.seats.filter((s) => s.kind === "human").length;
    if (settings.seatCount < humans) return fail("There are more players than seats at that table size.");
    // Re-seat humans compactly when the table size changes.
    if (settings.seatCount !== room.settings.seatCount) {
      const seated = room.seats.filter((s) => s.kind === "human");
      room.seats = this.emptySeats(settings.seatCount);
      seated.forEach((slot, i) => {
        room.seats[i] = slot;
        const seatedPlayer = slot.playerId ? room.players.get(slot.playerId) : undefined;
        if (seatedPlayer) seatedPlayer.seat = i;
      });
    }
    room.settings = { ...settings };
    this.changed(room);
    return done;
  }

  startMatch(code: string, playerId: string): Result {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player) return fail("That room no longer exists.");
    if (!player.isHost) return fail("Only the host can start the match.");
    if (room.status !== "lobby" && room.status !== "match-end") return fail("The match has already started.");
    this.seatWaitingPlayers(room, null);
    room.seats.forEach((slot) => {
      if (slot.kind === "empty") slot.kind = "bot";
    });
    room.match = createMatch(room.settings, this.options.seed());
    room.status = "playing";
    this.say(room, `The match begins. ${this.seatName(room, room.match.round.dealerSeat)} deals.`);
    this.changed(room);
    return done;
  }

  startNextRound(code: string, playerId: string): Result {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player || !room.match) return fail("That room no longer exists.");
    if (!player.isHost) return fail("Only the host can start the next round.");
    if (room.status !== "round-end") return fail("The next round cannot start now.");
    room.match = this.seatWaitingPlayers(room, room.match);
    return this.commit(room, startNextRound(room.match as MatchState));
  }

  endMatchEarly(code: string, playerId: string): Result {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player || !room.match) return fail("That room no longer exists.");
    if (!player.isHost) return fail("Only the host can end the match.");
    return this.commit(room, endMatchEarly(room.match));
  }

  // -------------------------------------------------------------------------
  // Game actions
  // -------------------------------------------------------------------------

  gameAction(code: string, playerId: string, action: GameAction, expectedVersion?: number): Result {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player) return fail("That room no longer exists.");
    if (!room.match || room.status !== "playing") return fail("No round is in progress.");
    if (player.seat === null) return fail("You are waiting for the next round.");
    if (expectedVersion !== undefined && expectedVersion !== room.version) {
      return fail("The table changed before your action arrived. Please try again.");
    }
    return this.commit(room, applyAction(room.match, player.seat, action));
  }

  private commit(room: Room, result: ActionResult): Result {
    if (!result.ok) return fail(result.error);
    room.match = result.state;
    room.status = result.state.status;
    for (const line of result.log) this.say(room, this.withNames(room, line));
    this.changed(room);
    return done;
  }

  // -------------------------------------------------------------------------
  // Bots
  // -------------------------------------------------------------------------

  private isBotTurn(room: Room): boolean {
    if (!room.match || room.status !== "playing") return false;
    const slot = room.seats[room.match.round.activeSeat];
    if (slot.kind === "bot") return true;
    const player = slot.playerId ? room.players.get(slot.playerId) : undefined;
    return !!player && player.botControlled;
  }

  private scheduleBot(room: Room): void {
    if (room.botTimer || !this.isBotTurn(room)) return;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      this.runBotStep(room);
    }, this.options.botDelayMs);
  }

  private runBotStep(room: Room): void {
    if (!this.rooms.has(room.code) || !this.isBotTurn(room) || !room.match) return;
    const match = room.match;
    const seat = match.round.activeSeat;
    if (room.botSteps.turn !== match.round.turnCount) room.botSteps = { turn: match.round.turnCount, count: 0 };
    room.botSteps.count += 1;
    const view = botViewOf(match, seat);
    let action = room.botSteps.count > MAX_BOT_STEPS_PER_TURN ? fallbackBotAction(view) : chooseBotAction(view);
    let result = applyAction(match, seat, action);
    if (!result.ok) {
      console.error(`[bot] rejected action in room ${room.code}: ${result.error}`);
      action = fallbackBotAction(view);
      result = applyAction(match, seat, action);
    }
    if (!result.ok) {
      console.error(`[bot] fallback rejected in room ${room.code}: ${result.error}`);
      return;
    }
    this.commit(room, result);
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  /** Builds what one player may see: the public table plus only their own hand. */
  viewFor(code: string, playerId: string): PublicRoomState | null {
    const room = this.rooms.get(code);
    const viewer = room?.players.get(playerId);
    if (!room || !viewer) return null;
    const match = room.match;
    const round = match?.round;
    const inRound = !!match && room.status !== "lobby";
    const seats: PublicSeat[] = room.seats.map((slot, seat) => {
      const player = slot.playerId ? room.players.get(slot.playerId) : undefined;
      const reserved = [...room.players.values()].find((p) => p.reservedSeat === seat);
      return {
        seat,
        kind: slot.kind,
        name: player ? player.name : slot.kind === "bot" ? slot.botName : "",
        playerId: player ? player.id : null,
        isHost: !!player && player.isHost,
        connected: player ? player.connected : true,
        botControlled: !!player && player.botControlled,
        reservedFor: reserved ? reserved.name : null,
        cardCount: inRound && round ? round.hands[seat].length : 0,
        opened: inRound && round ? round.opened[seat] : false,
        score: match ? match.scores[seat] : 0,
      };
    });
    const showResult = room.status === "round-end" || room.status === "match-end";
    const mySeat = viewer.seat;
    const isMyTurn = inRound && round && mySeat !== null && round.activeSeat === mySeat;
    return {
      code: room.code,
      status: room.status,
      version: room.version,
      settings: room.settings,
      seats,
      viewer: { playerId: viewer.id, name: viewer.name, seat: mySeat, isHost: viewer.isHost, waiting: mySeat === null },
      hand: inRound && round && mySeat !== null ? round.hands[mySeat] : [],
      drawnCardId: isMyTurn && round ? round.drawnCardId : null,
      roundNumber: round ? round.roundNumber : 0,
      tiebreak: match ? match.tiebreak : false,
      dealerSeat: round ? round.dealerSeat : null,
      activeSeat: room.status === "playing" && round ? round.activeSeat : null,
      turnPhase: round ? round.phase : "draw",
      cardSource: round ? round.source : null,
      stockCount: round ? round.stock.length : 0,
      discardCount: round ? round.discard.length : 0,
      topDiscard: round ? (round.discard[round.discard.length - 1] ?? null) : null,
      melds: round ? round.melds : [],
      nextMeldId: round ? round.nextMeldId : 1,
      lastResult: match && showResult ? match.lastResult : null,
      matchWinnerSeat: match ? match.matchWinnerSeat : null,
      canEndEarly: !!match && room.status === "round-end" && uniqueLowestSeat(match.scores) !== null,
      log: room.log,
    };
  }

  stats(): { rooms: number; players: number; connected: number; playing: number } {
    let players = 0;
    let connected = 0;
    let playing = 0;
    for (const room of this.rooms.values()) {
      players += room.players.size;
      connected += [...room.players.values()].filter((p) => p.connected).length;
      if (room.status === "playing") playing += 1;
    }
    return { rooms: this.rooms.size, players, connected, playing };
  }

  /** Removes rooms where nobody has been connected for a while. */
  sweep(now = Date.now()): void {
    for (const room of [...this.rooms.values()]) {
      const anyone = [...room.players.values()].some((p) => p.connected);
      if (!anyone && now - room.lastActivity > this.options.emptyRoomTtlMs) this.closeRoom(room, "The room was idle for too long.");
    }
  }

  authenticate(session: unknown): { room: Room; player: Player } | null {
    if (typeof session !== "object" || session === null) return null;
    const { roomCode, playerId, token } = session as Record<string, unknown>;
    if (typeof roomCode !== "string" || typeof playerId !== "string" || typeof token !== "string") return null;
    const room = this.rooms.get(roomCode.toUpperCase());
    const player = room?.players.get(playerId);
    if (!room || !player || player.token !== token) return null;
    return { room, player };
  }

  shutdown(): void {
    for (const room of [...this.rooms.values()]) this.closeRoom(room, "The server is restarting.");
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private emptySeats(count: number): SeatSlot[] {
    return Array.from({ length: count }, (_, i) => ({ kind: "empty" as const, playerId: null, botName: `Bot ${BOT_NAMES[i]}` }));
  }

  private findRoom(rawCode: unknown): Room | undefined {
    if (typeof rawCode !== "string") return undefined;
    return this.rooms.get(rawCode.trim().toUpperCase());
  }

  private addPlayer(room: Room, name: string, isHost: boolean): Player {
    const player: Player = {
      id: newId(9),
      name,
      token: newId(24),
      isHost,
      connected: true,
      seat: null,
      reservedSeat: null,
      botControlled: false,
      graceTimer: null,
    };
    room.players.set(player.id, player);
    return player;
  }

  private seat(room: Room, player: Player, seat: number): void {
    room.seats[seat].kind = "human";
    room.seats[seat].playerId = player.id;
    player.seat = seat;
    player.reservedSeat = null;
  }

  /** Waiting late joiners replace their reserved bots. Each takes the current highest score. */
  private seatWaitingPlayers(room: Room, match: MatchState | null): MatchState | null {
    let next = match;
    for (const player of room.players.values()) {
      if (player.reservedSeat === null) continue;
      const seat = player.reservedSeat;
      this.seat(room, player, seat);
      if (next) next = applyLateJoin(next, seat);
      this.say(room, `${player.name} takes a seat${next ? ` with ${next.scores[seat]} penalty points` : ""}.`);
    }
    return next;
  }

  private removePlayer(room: Room, player: Player): void {
    if (player.graceTimer) clearTimeout(player.graceTimer);
    room.players.delete(player.id);
    if (player.seat === null) return;
    const slot = room.seats[player.seat];
    slot.playerId = null;
    slot.kind = room.status === "lobby" ? "empty" : "bot";
  }

  private closeRoom(room: Room, reason: string): void {
    if (room.botTimer) clearTimeout(room.botTimer);
    room.botTimer = null;
    for (const player of room.players.values()) {
      if (player.graceTimer) clearTimeout(player.graceTimer);
    }
    this.rooms.delete(room.code);
    this.events.onClosed(room, reason);
  }

  private sessionOf(room: Room, player: Player): SessionInfo {
    return { roomCode: room.code, playerId: player.id, token: player.token };
  }

  private seatName(room: Room, seat: number): string {
    const slot = room.seats[seat];
    const player = slot.playerId ? room.players.get(slot.playerId) : undefined;
    return player ? player.name : slot.botName;
  }

  private withNames(room: Room, line: string): string {
    return line.replace(/\{(\d+)\}/g, (_, seat: string) => this.seatName(room, Number(seat)));
  }

  private say(room: Room, line: string): void {
    room.log.push(line);
    if (room.log.length > MAX_LOG_LINES) room.log.splice(0, room.log.length - MAX_LOG_LINES);
  }

  private changed(room: Room): void {
    room.version += 1;
    room.lastActivity = Date.now();
    this.events.onUpdate(room);
    this.scheduleBot(room);
  }
}
