import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as connect } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { AckResponse, ClientToServerEvents, PublicRoomState, ServerToClientEvents, SessionInfo } from "../shared/types.ts";
import { DEFAULT_SETTINGS } from "../shared/types.ts";
import { createGameServer } from "../server/app.ts";
import type { GameServer } from "../server/app.ts";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: GameServer;
let url: string;
const clients: Client[] = [];

function client(): Promise<Client> {
  return new Promise((resolve) => {
    const socket: Client = connect(url, { transports: ["websocket"], forceNew: true });
    clients.push(socket);
    socket.on("connect", () => resolve(socket));
  });
}

function nextState(socket: Client, accept: (state: PublicRoomState) => boolean): Promise<PublicRoomState> {
  return new Promise((resolve) => {
    const listener = (state: PublicRoomState) => {
      if (!accept(state)) return;
      socket.off("room_state", listener);
      resolve(state);
    };
    socket.on("room_state", listener);
  });
}

function ask<T>(run: (ack: (response: AckResponse<T>) => void) => void): Promise<AckResponse<T>> {
  return new Promise((resolve) => run(resolve));
}

beforeEach(async () => {
  server = createGameServer({ botDelayMs: 5, reconnectGraceMs: 80, hostGraceMs: 400, shuffleRitualEnabled: false }, true);
  await new Promise<void>((resolve) => server.http.listen(0, resolve));
  url = `http://localhost:${(server.http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((socket) => socket.close());
  await server.close();
});

describe("socket server", () => {
  it("runs a room over real sockets and keeps hands private", async () => {
    const host = await client();
    const created = await ask<SessionInfo>((ack) => host.emit("create_room", { name: "Mona", settings: DEFAULT_SETTINGS }, ack));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const friend = await client();
    const friendLobby = nextState(friend, (s) => s.status === "lobby");
    const joined = await ask<SessionInfo>((ack) => friend.emit("join_room", { name: "Omar", roomCode: created.data.roomCode }, ack));
    expect(joined.ok).toBe(true);
    expect((await friendLobby).seats.filter((s) => s.kind === "human")).toHaveLength(2);

    const notHost = await ask((ack) => friend.emit("start_match", ack));
    expect(notHost).toEqual({ ok: false, error: "Only the host can start the match." });

    const hostTable = nextState(host, (s) => s.status === "playing");
    const friendTable = nextState(friend, (s) => s.status === "playing");
    expect((await ask((ack) => host.emit("start_match", ack))).ok).toBe(true);
    const [a, b] = await Promise.all([hostTable, friendTable]);
    expect(a.hand).toHaveLength(14);
    expect(b.hand).toHaveLength(14);
    const idsA = new Set(a.hand.map((c) => c.id));
    expect(b.hand.some((c) => idsA.has(c.id))).toBe(false);
    const wireA = JSON.stringify(a);
    for (const hidden of b.hand) expect(wireA).not.toContain(`"${hidden.id}"`);

    const bad = await ask((ack) => host.emit("game_action", { action: { type: "HACK" } as never }, ack));
    expect(bad).toEqual({ ok: false, error: "That action is not valid." });
  });

  it("hands a dropped player's seat to a bot and gives it back on reconnect", async () => {
    const host = await client();
    const created = await ask<SessionInfo>((ack) => host.emit("create_room", { name: "Mona", settings: DEFAULT_SETTINGS }, ack));
    if (!created.ok) throw new Error(created.error);
    const friend = await client();
    const joined = await ask<SessionInfo>((ack) => friend.emit("join_room", { name: "Omar", roomCode: created.data.roomCode }, ack));
    if (!joined.ok) throw new Error(joined.error);
    await ask((ack) => host.emit("start_match", ack));

    const takenOver = nextState(host, (s) => s.seats.some((seat) => seat.name === "Omar" && seat.botControlled));
    friend.close();
    const covered = await takenOver;
    expect(covered.seats.find((s) => s.name === "Omar")?.kind).toBe("human");

    const returning = await client();
    const back = nextState(host, (s) => s.seats.some((seat) => seat.name === "Omar" && seat.connected && !seat.botControlled));
    const restored = await ask<SessionInfo>((ack) => returning.emit("reconnect_player", joined.data, ack));
    expect(restored.ok).toBe(true);
    await back;

    const forged = await client();
    const rejected = await ask<SessionInfo>((ack) => forged.emit("reconnect_player", { ...joined.data, token: "forged" }, ack));
    expect(rejected.ok).toBe(false);
  });

  it("tells everyone when the host leaves and the room closes", async () => {
    const host = await client();
    const created = await ask<SessionInfo>((ack) => host.emit("create_room", { name: "Mona", settings: DEFAULT_SETTINGS }, ack));
    if (!created.ok) throw new Error(created.error);
    const friend = await client();
    await ask<SessionInfo>((ack) => friend.emit("join_room", { name: "Omar", roomCode: created.data.roomCode }, ack));
    const closed = new Promise<string>((resolve) => friend.on("room_closed", resolve));
    await ask((ack) => host.emit("leave_room", ack));
    expect(await closed).toMatch(/host left/i);
  });
});
