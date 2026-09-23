import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicRoomState, SeatCount, SessionInfo } from "../shared/types.ts";
import { DEFAULT_SETTINGS } from "../shared/types.ts";
import { BOT_AVATAR_IDS } from "../shared/avatars.ts";
import { RoomManager } from "../server/rooms.ts";
import type { Room } from "../server/rooms.ts";
import { parseAction, parseSettings } from "../server/validate.ts";

const GRACE = 1000;
const HOST_GRACE = 5000;
const BOT_DELAY = 10;

function setup(hostGrace = HOST_GRACE) {
  const closed: { code: string; reason: string }[] = [];
  let updates = 0;
  const manager = new RoomManager(
    {
      onUpdate: () => {
        updates += 1;
      },
      onClosed: (room: Room, reason: string) => closed.push({ code: room.code, reason }),
    },
    { botDelayMs: BOT_DELAY, reconnectGraceMs: GRACE, hostGraceMs: hostGrace, seed: () => 11, shuffleRitualEnabled: false },
  );
  return { manager, closed, updateCount: () => updates };
}

function ritualSetup() {
  const manager = new RoomManager(
    { onUpdate: () => undefined, onClosed: () => undefined },
    { botDelayMs: BOT_DELAY, reconnectGraceMs: GRACE, hostGraceMs: HOST_GRACE, seed: () => 11, shuffleTimeoutMs: 100, shuffleAutoStepMs: 10, shuffleDealMs: 20 },
  );
  const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
  const players = [host, ...["Omar", "Nour", "Salma"].map((name) => must(manager.joinRoom(name, host.roomCode)))];
  must(manager.startMatch(host.roomCode, host.playerId));
  const dealerSeat = view(manager, host).dealerSeat;
  const dealer = players.find((session) => view(manager, session).viewer.seat === dealerSeat);
  if (!dealer) throw new Error("No human dealer");
  return { manager, host, players, dealer };
}

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function view(manager: RoomManager, session: SessionInfo): PublicRoomState {
  const state = manager.viewFor(session.roomCode, session.playerId);
  if (!state) throw new Error("no view");
  return state;
}

/** Collects every card-shaped object found anywhere inside a value. */
function cardIdsIn(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => cardIdsIn(v, found));
  else if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string" && "rank" in record && "suit" in record) found.push(record.id);
    Object.values(record).forEach((v) => cardIdsIn(v, found));
  }
  return found;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("avatars", () => {
  it("keeps a player's choice while named bots use only male portraits", () => {
    const { manager } = setup();
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS, 4));
    const friend = must(manager.joinRoom("Omar", host.roomCode, 2));
    expect(view(manager, host).seats[0].avatarId).toBe(4);
    expect(view(manager, host).seats[1].avatarId).toBe(2);

    must(manager.updateAvatar(host.roomCode, friend.playerId, 0));
    expect(view(manager, host).seats[1].avatarId).toBe(0);
    expect(manager.updateAvatar(host.roomCode, friend.playerId, 99).ok).toBe(false);
    must(manager.startMatch(host.roomCode, host.playerId));
    const seats = view(manager, host).seats;
    expect(seats.filter((seat) => seat.kind === "bot").every((seat) => BOT_AVATAR_IDS.some((id) => id === seat.avatarId))).toBe(true);

    manager.markDisconnected(host.roomCode, friend.playerId);
    vi.advanceTimersByTime(GRACE);
    expect(view(manager, host).seats[1]).toMatchObject({ avatarId: 0, botControlled: true });
  });
});

describe("cosmetic dealer shuffle", () => {
  it("gates all hands until the dealer completes three swipes without changing the deck", () => {
    const { manager, host, players, dealer } = ritualSetup();
    const round = manager.authenticate(host)?.room.match?.round;
    if (!round) throw new Error("No round");
    const originalHands = round.hands.map((hand) => hand.map((card) => card.id));
    const originalStock = round.stock.map((card) => card.id);
    const stranger = players.find((player) => player.playerId !== dealer.playerId)!;

    for (const player of players) {
      const state = view(manager, player);
      expect(state.shuffleRitual).toMatchObject({ phase: "shuffling", swipes: 0 });
      expect(state.hand).toEqual([]);
      expect(state.seats.every((seat) => seat.cardCount === 0)).toBe(true);
      expect(state.stockCount).toBe(0);
      expect(state.topDiscard).toBeNull();
    }
    expect(manager.gameAction(host.roomCode, host.playerId, { type: "DRAW_FROM_STOCK" }).ok).toBe(false);
    expect(manager.shuffleSwipe(stranger.roomCode, stranger.playerId).ok).toBe(false);

    for (let count = 1; count <= 3; count++) {
      must(manager.shuffleSwipe(dealer.roomCode, dealer.playerId));
      expect(view(manager, host).shuffleRitual?.swipes).toBe(count);
    }
    expect(view(manager, host).shuffleRitual?.phase).toBe("dealing");
    expect(view(manager, host).hand).toEqual([]);
    expect(manager.shuffleSwipe(dealer.roomCode, dealer.playerId).ok).toBe(false);
    vi.advanceTimersByTime(20);
    expect(view(manager, host).shuffleRitual).toBeNull();
    expect(view(manager, host).hand).toHaveLength(14);
    expect(round.hands.map((hand) => hand.map((card) => card.id))).toEqual(originalHands);
    expect(round.stock.map((card) => card.id)).toEqual(originalStock);
  });

  it("auto-completes after dealer inactivity or disconnection", () => {
    const timedOut = ritualSetup();
    vi.advanceTimersByTime(100 + 10 + 10 + 20);
    expect(view(timedOut.manager, timedOut.host).shuffleRitual).toBeNull();

    const disconnected = ritualSetup();
    disconnected.manager.markDisconnected(disconnected.dealer.roomCode, disconnected.dealer.playerId);
    vi.advanceTimersByTime(10 + 10 + 10 + 20);
    expect(view(disconnected.manager, disconnected.host).shuffleRitual).toBeNull();
  });

  it("lets a bot dealer shuffle automatically and repeats the ritual next round", () => {
    const manager = new RoomManager(
      { onUpdate: () => undefined, onClosed: () => undefined },
      { seed: () => 11, botDelayMs: 1000, shuffleAutoStepMs: 10, shuffleDealMs: 20 },
    );
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    must(manager.startMatch(host.roomCode, host.playerId));
    expect(view(manager, host).seats[view(manager, host).dealerSeat!].kind).toBe("bot");
    vi.advanceTimersByTime(10);
    expect(view(manager, host).shuffleRitual?.swipes).toBe(1);
    vi.advanceTimersByTime(10 + 10 + 20);
    expect(view(manager, host).shuffleRitual).toBeNull();

    const room = manager.authenticate(host)?.room;
    if (!room?.match) throw new Error("No match");
    const previousDealer = room.match.round.dealerSeat;
    room.match.status = "round-end";
    room.status = "round-end";
    must(manager.startNextRound(host.roomCode, host.playerId));
    expect(view(manager, host).roundNumber).toBe(2);
    expect(view(manager, host).shuffleRitual).toMatchObject({ phase: "shuffling", swipes: 0, dealerSeat: (previousDealer + 1) % 4 });
    expect(view(manager, host).hand).toEqual([]);
  });
});

describe("rooms and seats", () => {
  it.each([4, 5, 6] as SeatCount[])("creates a %i-seat room and fills empty seats with bots", (seatCount) => {
    const { manager } = setup();
    const host = must(manager.createRoom("Mona", { ...DEFAULT_SETTINGS, seatCount }));
    expect(host.roomCode).toMatch(/^[A-Z2-9]{6}$/);
    const friend = must(manager.joinRoom("Omar", host.roomCode.toLowerCase()));
    const lobby = view(manager, host);
    expect(lobby.seats).toHaveLength(seatCount);
    expect(lobby.seats.filter((s) => s.kind === "human")).toHaveLength(2);
    expect(lobby.seats.filter((s) => s.kind === "empty")).toHaveLength(seatCount - 2);
    expect(manager.startMatch(friend.roomCode, friend.playerId).ok).toBe(false);
    must(manager.startMatch(host.roomCode, host.playerId));
    const table = view(manager, host);
    expect(table.status).toBe("playing");
    expect(table.seats.filter((s) => s.kind === "bot")).toHaveLength(seatCount - 2);
    expect(table.seats.every((s) => s.cardCount === 14)).toBe(true);
    expect(table.hand).toHaveLength(14);
  });

  it("starts with one human and bots everywhere else", () => {
    const { manager } = setup();
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    must(manager.startMatch(host.roomCode, host.playerId));
    expect(view(manager, host).seats.filter((s) => s.kind === "bot")).toHaveLength(3);
  });

  it("rejects bad names, unknown codes, duplicate names, and full lobbies", () => {
    const { manager } = setup();
    expect(manager.createRoom("   ", DEFAULT_SETTINGS).ok).toBe(false);
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    expect(manager.joinRoom("Omar", "NOPE99").ok).toBe(false);
    expect(manager.joinRoom("mona", host.roomCode).ok).toBe(false);
    for (const name of ["A", "B", "C"]) must(manager.joinRoom(name, host.roomCode));
    expect(manager.joinRoom("D", host.roomCode)).toEqual({ ok: false, error: "That room is full." });
  });

  it("locks settings once the match begins", () => {
    const { manager } = setup();
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    must(manager.updateSettings(host.roomCode, host.playerId, { ...DEFAULT_SETTINGS, seatCount: 6, openingThreshold: 51 }));
    expect(view(manager, host).seats).toHaveLength(6);
    expect(manager.updateSettings(host.roomCode, host.playerId, { ...DEFAULT_SETTINGS, openingThreshold: 0 }).ok).toBe(false);
    must(manager.startMatch(host.roomCode, host.playerId));
    const result = manager.updateSettings(host.roomCode, host.playerId, DEFAULT_SETTINGS);
    expect(result).toEqual({ ok: false, error: "Settings are locked once the match begins." });
  });

  it("closes the room for everyone when the host leaves", () => {
    const { manager, closed } = setup();
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    const friend = must(manager.joinRoom("Omar", host.roomCode));
    must(manager.leaveRoom(host.roomCode, host.playerId));
    expect(closed).toHaveLength(1);
    expect(closed[0].reason).toMatch(/host left/i);
    expect(manager.viewFor(friend.roomCode, friend.playerId)).toBeNull();
    expect(manager.reconnect(friend).ok).toBe(false);
  });

  it("closes the room when a disconnected host does not return", () => {
    const { manager, closed } = setup();
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    manager.markDisconnected(host.roomCode, host.playerId);
    vi.advanceTimersByTime(HOST_GRACE - 1);
    expect(closed).toHaveLength(0);
    vi.advanceTimersByTime(2);
    expect(closed).toHaveLength(1);
  });
});

describe("host disconnection during a match", () => {
  it("covers the host with a bot first and closes the room only after the longer host grace", () => {
    const { manager, closed } = setup();
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    must(manager.startMatch(host.roomCode, host.playerId));
    manager.markDisconnected(host.roomCode, host.playerId);
    vi.advanceTimersByTime(GRACE + 1);
    expect(closed).toHaveLength(0);
    expect(view(manager, host).seats[0].botControlled).toBe(true);
    vi.advanceTimersByTime(HOST_GRACE);
    expect(closed).toHaveLength(1);
  });
});

describe("late joining", () => {
  function playingRoom() {
    const ctx = setup();
    const host = must(ctx.manager.createRoom("Mona", DEFAULT_SETTINGS));
    const friend = must(ctx.manager.joinRoom("Omar", host.roomCode));
    must(ctx.manager.startMatch(host.roomCode, host.playerId));
    return { ...ctx, host, friend };
  }

  it("makes a late player wait, hides hands, and seats them next round with the highest score", () => {
    const { manager, host } = playingRoom();
    const late = must(manager.joinRoom("Lina", host.roomCode));
    const waiting = view(manager, late);
    expect(waiting.viewer.waiting).toBe(true);
    expect(waiting.hand).toHaveLength(0);
    expect(cardIdsIn(waiting)).toEqual(waiting.topDiscard ? [waiting.topDiscard.id] : []);
    expect(waiting.seats.filter((s) => s.reservedFor === "Lina")).toHaveLength(1);
    expect(manager.gameAction(late.roomCode, late.playerId, { type: "DRAW_FROM_STOCK" }).ok).toBe(false);

    // Force the round to end with known scores, then start the next one.
    const room = manager.rooms.get(host.roomCode) as Room;
    const match = room.match!;
    match.status = "round-end";
    match.scores = [12, 40, 7, 33];
    room.status = "round-end";
    must(manager.startNextRound(host.roomCode, host.playerId));
    const seated = view(manager, late);
    expect(seated.viewer.waiting).toBe(false);
    expect(seated.hand).toHaveLength(14);
    const seat = seated.viewer.seat as number;
    expect(seated.seats[seat].kind).toBe("human");
    expect(seated.seats[seat].score).toBe(40);
    expect(seated.seats[seat].reservedFor).toBeNull();
  });

  it("rejects extra players when every seat is human-controlled or reserved", () => {
    const { manager, host } = playingRoom();
    must(manager.joinRoom("Lina", host.roomCode));
    must(manager.joinRoom("Sami", host.roomCode));
    const result = manager.joinRoom("Extra", host.roomCode);
    expect(result).toEqual({ ok: false, error: "Every seat in that room is taken by a player." });
  });
});

describe("privacy and validation", () => {
  it("never sends a player another player's hand", () => {
    const { manager } = setup();
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    const friend = must(manager.joinRoom("Omar", host.roomCode));
    must(manager.startMatch(host.roomCode, host.playerId));
    const room = manager.rooms.get(host.roomCode) as Room;
    for (const session of [host, friend]) {
      const state = view(manager, session);
      const mine = new Set(state.hand.map((c) => c.id));
      const visible = new Set([...mine, ...(state.topDiscard ? [state.topDiscard.id] : []), ...state.melds.flatMap((m) => m.cards.map((c) => c.card.id))]);
      for (const id of cardIdsIn(state)) expect(visible.has(id)).toBe(true);
      const others = room.match!.round.hands.filter((_, seat) => seat !== state.viewer.seat).flat();
      const serialised = JSON.stringify({ ...state, hand: [] });
      for (const other of others) {
        if (!visible.has(other.id)) expect(serialised.includes(`"${other.id}"`)).toBe(false);
      }
      expect(JSON.stringify(state)).not.toContain(room.players.get(session.playerId)!.token);
    }
  });

  it("rejects out-of-turn, stale, and duplicate actions without corrupting state", () => {
    const { manager } = setup();
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    const friend = must(manager.joinRoom("Omar", host.roomCode));
    must(manager.startMatch(host.roomCode, host.playerId));
    const room = manager.rooms.get(host.roomCode) as Room;
    room.match!.round.activeSeat = 0;
    const before = view(manager, host);

    expect(manager.gameAction(friend.roomCode, friend.playerId, { type: "DRAW_FROM_STOCK" })).toEqual({ ok: false, error: "It is not your turn." });
    expect(manager.gameAction(host.roomCode, host.playerId, { type: "DRAW_FROM_STOCK" }, before.version - 1).ok).toBe(false);
    expect(view(manager, host).hand).toHaveLength(14);

    must(manager.gameAction(host.roomCode, host.playerId, { type: "DRAW_FROM_STOCK" }, before.version));
    // The same message delivered twice: the copy carries a stale version and is refused.
    expect(manager.gameAction(host.roomCode, host.playerId, { type: "DRAW_FROM_STOCK" }, before.version).ok).toBe(false);
    // Even without a version, a second draw is refused by the rules.
    expect(manager.gameAction(host.roomCode, host.playerId, { type: "DRAW_FROM_STOCK" }).ok).toBe(false);
    const after = view(manager, host);
    expect(after.hand).toHaveLength(15);

    const discard = after.hand.find((c) => c.rank !== "JOKER")!;
    must(manager.gameAction(host.roomCode, host.playerId, { type: "DISCARD_CARD", cardId: discard.id }));
    // A reordered or repeated discard arrives after the turn has passed.
    expect(manager.gameAction(host.roomCode, host.playerId, { type: "DISCARD_CARD", cardId: discard.id }).ok).toBe(false);
    expect(view(manager, host).hand).toHaveLength(14);
  });

  it("refuses malformed payloads", () => {
    expect(parseAction(null)).toBeNull();
    expect(parseAction({ type: "DISCARD_CARD" })).toBeNull();
    expect(parseAction({ type: "PLAY", plays: [] })).toBeNull();
    expect(parseAction({ type: "PLAY", plays: [{ kind: "new-meld", cardIds: [1, 2, 3] }] })).toBeNull();
    expect(parseAction({ type: "PLAY", plays: [{ kind: "add", cardIds: ["a"] }] })).toBeNull();
    expect(parseAction({ type: "HACK" })).toBeNull();
    expect(parseAction({ type: "PLAY", plays: [{ kind: "new-meld", cardIds: ["a", "b", "c"], jokerAs: { a: { rank: "Z", suit: "hearts" } } }] })).toBeNull();
    expect(parseAction({ type: "DISCARD_CARD", cardId: "d0-hearts-7", extra: true })).toEqual({ type: "DISCARD_CARD", cardId: "d0-hearts-7" });
    expect(parseSettings({ ...DEFAULT_SETTINGS, seatCount: 3 })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, jokerCount: "4" })).toBeNull();
    expect(parseSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("disconnections", () => {
  it("lets a bot take over after the grace period and returns the seat on reconnect", () => {
    const { manager } = setup();
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    const friend = must(manager.joinRoom("Omar", host.roomCode));
    must(manager.startMatch(host.roomCode, host.playerId));
    const room = manager.rooms.get(host.roomCode) as Room;
    const friendSeat = view(manager, friend).viewer.seat as number;
    const handBefore = view(manager, friend).hand.map((c) => c.id);
    // Park the turn on the host so bots stay idle while we test the timer.
    room.match!.round.activeSeat = view(manager, host).viewer.seat as number;

    manager.markDisconnected(friend.roomCode, friend.playerId);
    expect(view(manager, host).seats[friendSeat].connected).toBe(false);
    expect(view(manager, host).seats[friendSeat].botControlled).toBe(false);
    vi.advanceTimersByTime(GRACE + 1);
    expect(view(manager, host).seats[friendSeat].botControlled).toBe(true);
    expect(view(manager, host).seats[friendSeat].kind).toBe("human");

    const bad = manager.reconnect({ ...friend, token: "wrong" });
    expect(bad.ok).toBe(false);
    must(manager.reconnect(friend));
    const back = view(manager, friend);
    expect(back.seats[friendSeat].botControlled).toBe(false);
    expect(back.seats[friendSeat].connected).toBe(true);
    expect(back.viewer.seat).toBe(friendSeat);
    expect(back.hand.map((c) => c.id)).toEqual(handBefore);
  });

  it("plays the disconnected player's turns with a bot, keeping hand, score, and seat", () => {
    const { manager } = setup();
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    const friend = must(manager.joinRoom("Omar", host.roomCode));
    must(manager.startMatch(host.roomCode, host.playerId));
    const room = manager.rooms.get(host.roomCode) as Room;
    const friendSeat = view(manager, friend).viewer.seat as number;
    room.match!.round.activeSeat = friendSeat;
    room.match!.round.phase = "draw";
    manager.markDisconnected(friend.roomCode, friend.playerId);
    vi.advanceTimersByTime(GRACE + 1);
    const turnBefore = room.match!.round.turnCount;
    vi.advanceTimersByTime(BOT_DELAY * 50);
    expect(room.match!.round.turnCount).toBeGreaterThan(turnBefore);
    expect(view(manager, host).seats[friendSeat].name).toBe("Omar");
  });

  it("frees a lobby seat when a player does not return", () => {
    const { manager } = setup();
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    const friend = must(manager.joinRoom("Omar", host.roomCode));
    manager.markDisconnected(friend.roomCode, friend.playerId);
    vi.advanceTimersByTime(GRACE + 1);
    expect(view(manager, host).seats.filter((s) => s.kind === "human")).toHaveLength(1);
  });

  it("turns a leaving player's seat into a bot during a match", () => {
    const { manager } = setup();
    const host = must(manager.createRoom("Mona", DEFAULT_SETTINGS));
    const friend = must(manager.joinRoom("Omar", host.roomCode));
    must(manager.startMatch(host.roomCode, host.playerId));
    const seat = view(manager, friend).viewer.seat as number;
    must(manager.leaveRoom(friend.roomCode, friend.playerId));
    expect(view(manager, host).seats[seat].kind).toBe("bot");
  });
});

describe("bots on the server", () => {
  it("plays a whole match unattended when the only human is away", () => {
    const { manager } = setup(10_000_000);
    const host = must(manager.createRoom("Mona", { ...DEFAULT_SETTINGS, matchFormat: "fixed-rounds", roundCount: 2 }));
    must(manager.startMatch(host.roomCode, host.playerId));
    const room = manager.rooms.get(host.roomCode) as Room;
    manager.markDisconnected(host.roomCode, host.playerId);
    vi.advanceTimersByTime(GRACE + 1);
    expect(view(manager, host).seats[0].botControlled).toBe(true);
    for (let i = 0; i < 20000 && room.status !== "match-end"; i++) {
      vi.advanceTimersByTime(BOT_DELAY);
      if (room.status === "round-end") must(manager.startNextRound(host.roomCode, host.playerId));
    }
    expect(room.status).toBe("match-end");
    const final = view(manager, host);
    expect(final.matchWinnerSeat).not.toBeNull();
    expect(final.lastResult).not.toBeNull();
  });
});
