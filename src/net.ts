import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { AckResponse, ClientToServerEvents, GameAction, PublicRoomState, RoomSettings, ServerToClientEvents, SessionInfo } from "../shared/types.ts";

const SESSION_KEY = "romino-session";

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function loadSession(): SessionInfo | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const session = raw ? (JSON.parse(raw) as SessionInfo) : null;
    // An invite link for a different room beats an old saved session.
    const invited = new URLSearchParams(window.location.search).get("room");
    if (session && invited && invited.toUpperCase() !== session.roomCode) return null;
    return session;
  } catch {
    return null;
  }
}

function saveSession(session: SessionInfo | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage can be unavailable in private windows. The game still works for this tab.
  }
}

export interface Game {
  connected: boolean;
  /** True while a saved session is being restored after a page load. */
  restoring: boolean;
  room: PublicRoomState | null;
  closedReason: string | null;
  error: string | null;
  clearError: () => void;
  dismissClosed: () => void;
  createRoom: (name: string, settings: RoomSettings) => Promise<boolean>;
  joinRoom: (name: string, roomCode: string) => Promise<boolean>;
  updateSettings: (settings: RoomSettings) => Promise<boolean>;
  startMatch: () => Promise<boolean>;
  startNextRound: () => Promise<boolean>;
  endMatchEarly: () => Promise<boolean>;
  act: (action: GameAction) => Promise<boolean>;
  leave: () => Promise<void>;
}

export function useGame(): Game {
  const socketRef = useRef<GameSocket | null>(null);
  const sessionRef = useRef<SessionInfo | null>(loadSession());
  const roomRef = useRef<PublicRoomState | null>(null);
  const leavingRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [restoring, setRestoring] = useState(sessionRef.current !== null);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket: GameSocket = io({ transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      const session = sessionRef.current;
      if (!session) {
        setRestoring(false);
        return;
      }
      // Runs on first load and after every network drop, so the seat is reclaimed automatically.
      socket.emit("reconnect_player", session, (response) => {
        setRestoring(false);
        if (!response.ok) {
          sessionRef.current = null;
          saveSession(null);
          roomRef.current = null;
          setRoom(null);
        }
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("room_state", (state) => {
      roomRef.current = state;
      setRoom(state);
    });
    socket.on("room_closed", (reason) => {
      sessionRef.current = null;
      saveSession(null);
      roomRef.current = null;
      setRoom(null);
      // A host who leaves on purpose does not need to be told that the room closed.
      if (!leavingRef.current) setClosedReason(reason);
    });
    socket.on("notice", (message) => setError(message));
    return () => {
      socket.close();
    };
  }, []);

  const handle = useCallback(<T,>(response: AckResponse<T>): response is { ok: true; data: T } => {
    if (response.ok) {
      setError(null);
      return true;
    }
    setError(response.error);
    return false;
  }, []);

  const enter = useCallback(
    (response: AckResponse<SessionInfo>): boolean => {
      if (!handle(response)) return false;
      sessionRef.current = response.data;
      saveSession(response.data);
      return true;
    },
    [handle],
  );

  const createRoom = useCallback(
    (name: string, settings: RoomSettings) =>
      new Promise<boolean>((resolve) => {
        socketRef.current?.emit("create_room", { name, settings }, (response) => resolve(enter(response)));
      }),
    [enter],
  );

  const joinRoom = useCallback(
    (name: string, roomCode: string) =>
      new Promise<boolean>((resolve) => {
        socketRef.current?.emit("join_room", { name, roomCode }, (response) => resolve(enter(response)));
      }),
    [enter],
  );

  const simple = useCallback(
    (event: "start_match" | "start_next_round" | "end_match_early") =>
      new Promise<boolean>((resolve) => {
        socketRef.current?.emit(event, (response) => resolve(handle(response)));
      }),
    [handle],
  );

  const updateSettings = useCallback(
    (settings: RoomSettings) =>
      new Promise<boolean>((resolve) => {
        socketRef.current?.emit("update_settings", settings, (response) => resolve(handle(response)));
      }),
    [handle],
  );

  const act = useCallback(
    (action: GameAction) =>
      new Promise<boolean>((resolve) => {
        const expectedVersion = roomRef.current?.version;
        socketRef.current?.emit("game_action", { action, expectedVersion }, (response) => resolve(handle(response)));
      }),
    [handle],
  );

  const leave = useCallback(
    () =>
      new Promise<void>((resolve) => {
        leavingRef.current = true;
        const finish = () => {
          leavingRef.current = false;
          sessionRef.current = null;
          saveSession(null);
          roomRef.current = null;
          setRoom(null);
          resolve();
        };
        const socket = socketRef.current;
        if (!socket || !socket.connected) return finish();
        socket.emit("leave_room", () => finish());
      }),
    [],
  );

  return {
    connected,
    restoring,
    room,
    closedReason,
    error,
    clearError: useCallback(() => setError(null), []),
    dismissClosed: useCallback(() => setClosedReason(null), []),
    createRoom,
    joinRoom,
    updateSettings,
    startMatch: useCallback(() => simple("start_match"), [simple]),
    startNextRound: useCallback(() => simple("start_next_round"), [simple]),
    endMatchEarly: useCallback(() => simple("end_match_early"), [simple]),
    act,
    leave,
  };
}
