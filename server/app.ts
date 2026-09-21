import { existsSync } from "node:fs";
import { createServer } from "node:http";
import type { Server as HttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";
import type { Socket } from "socket.io";
import type { Ack, ClientToServerEvents, ServerToClientEvents } from "../shared/types.ts";
import { RoomManager } from "./rooms.ts";
import type { Result, RoomOptions } from "./rooms.ts";
import { parseAction, parseSettings } from "./validate.ts";

interface SocketData {
  roomCode?: string;
  playerId?: string;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface GameServer {
  http: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  manager: RoomManager;
  close: () => Promise<void>;
}

const playerChannel = (roomCode: string, playerId: string) => `player:${roomCode}:${playerId}`;

function log(event: string, details: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...details }));
}

export function createGameServer(options: Partial<RoomOptions> = {}, quiet = false): GameServer {
  const app = express();
  const http = createServer(app);
  const io: GameServer["io"] = new Server(http, { maxHttpBufferSize: 64 * 1024 });
  const startedAt = Date.now();

  const manager = new RoomManager(
    {
      onUpdate: (room) => {
        for (const player of room.players.values()) {
          const view = manager.viewFor(room.code, player.id);
          if (view) io.to(playerChannel(room.code, player.id)).emit("room_state", view);
        }
      },
      onClosed: (room, reason) => {
        if (!quiet) log("room_closed", { room: room.code, reason });
        for (const player of room.players.values()) {
          const channel = playerChannel(room.code, player.id);
          io.to(channel).emit("room_closed", reason);
          io.in(channel).socketsLeave(channel);
        }
      },
    },
    options,
  );

  app.disable("x-powered-by");
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });
  });
  app.get("/metrics", (_req, res) => {
    res.json({ ...manager.stats(), sockets: io.engine.clientsCount, memoryMb: Math.round(process.memoryUsage().rss / 1048576) });
  });

  // In production the built client is served from the same origin.
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: "1h", index: "index.html" }));
    app.get(/^\/(?!socket\.io|healthz|metrics).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  const sweeper = setInterval(() => manager.sweep(), 60_000);
  sweeper.unref();

  /** True when no other socket of the same player is still connected. */
  async function isLastSocket(socket: GameSocket): Promise<boolean> {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return false;
    const others = await io.in(playerChannel(roomCode, playerId)).fetchSockets();
    return others.every((s) => s.id === socket.id);
  }

  function attach(socket: GameSocket, roomCode: string, playerId: string): void {
    socket.data.roomCode = roomCode;
    socket.data.playerId = playerId;
    void socket.join(playerChannel(roomCode, playerId));
    const view = manager.viewFor(roomCode, playerId);
    if (view) socket.emit("room_state", view);
  }

  async function detach(socket: GameSocket): Promise<void> {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const last = await isLastSocket(socket);
    void socket.leave(playerChannel(roomCode, playerId));
    socket.data.roomCode = undefined;
    socket.data.playerId = undefined;
    if (last) manager.markDisconnected(roomCode, playerId);
  }

  function reply<T>(ack: unknown, result: Result<T>): void {
    if (typeof ack === "function") (ack as Ack<T>)(result);
  }

  /** Runs a handler for a socket that is already in a room. */
  function inRoom(socket: GameSocket, ack: unknown, handler: (roomCode: string, playerId: string) => Result): void {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) {
      reply(ack, { ok: false, error: "You are not in a room." });
      return;
    }
    try {
      reply(ack, handler(roomCode, playerId));
    } catch (error) {
      console.error(error);
      reply(ack, { ok: false, error: "The server could not process that action." });
    }
  }

  io.on("connection", (socket: GameSocket) => {
    socket.on("create_room", async (payload, ack) => {
      const settings = parseSettings(payload?.settings);
      if (!settings) return reply(ack, { ok: false, error: "Those room settings are not valid." });
      await detach(socket);
      const result = manager.createRoom(payload?.name, settings);
      if (result.ok) {
        attach(socket, result.data.roomCode, result.data.playerId);
        if (!quiet) log("room_created", { room: result.data.roomCode });
      }
      reply(ack, result);
    });

    socket.on("join_room", async (payload, ack) => {
      await detach(socket);
      const result = manager.joinRoom(payload?.name, payload?.roomCode);
      if (result.ok) attach(socket, result.data.roomCode, result.data.playerId);
      reply(ack, result);
    });

    socket.on("reconnect_player", async (session, ack) => {
      await detach(socket);
      const result = manager.reconnect(session);
      if (result.ok) attach(socket, result.data.roomCode, result.data.playerId);
      reply(ack, result);
    });

    socket.on("update_settings", (raw, ack) => {
      const settings = parseSettings(raw);
      if (!settings) return reply(ack, { ok: false, error: "Those room settings are not valid." });
      inRoom(socket, ack, (code, id) => manager.updateSettings(code, id, settings));
    });

    socket.on("start_match", (ack) => inRoom(socket, ack, (code, id) => manager.startMatch(code, id)));
    socket.on("start_next_round", (ack) => inRoom(socket, ack, (code, id) => manager.startNextRound(code, id)));
    socket.on("end_match_early", (ack) => inRoom(socket, ack, (code, id) => manager.endMatchEarly(code, id)));
    socket.on("reclaim_bot_seat", (ack) => inRoom(socket, ack, (code, id) => manager.reclaimSeat(code, id)));

    socket.on("game_action", (payload, ack) => {
      const action = parseAction(payload?.action);
      if (!action) return reply(ack, { ok: false, error: "That action is not valid." });
      const expected = typeof payload?.expectedVersion === "number" ? payload.expectedVersion : undefined;
      inRoom(socket, ack, (code, id) => manager.gameAction(code, id, action, expected));
    });

    socket.on("leave_room", (ack) => {
      const { roomCode, playerId } = socket.data;
      inRoom(socket, ack, (code, id) => manager.leaveRoom(code, id));
      if (roomCode && playerId) {
        void socket.leave(playerChannel(roomCode, playerId));
        socket.data.roomCode = undefined;
        socket.data.playerId = undefined;
      }
    });

    socket.on("disconnecting", () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      void isLastSocket(socket).then((last) => {
        if (last) manager.markDisconnected(roomCode, playerId);
      });
    });
  });

  return {
    http,
    io,
    manager,
    close: async () => {
      clearInterval(sweeper);
      manager.shutdown();
      await io.close();
    },
  };
}
