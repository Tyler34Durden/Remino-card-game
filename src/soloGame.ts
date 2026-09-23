import { useCallback, useEffect, useRef, useState } from "react";
import type { GameAction, PublicRoomState, RoomSettings, SessionInfo } from "../shared/types.ts";
import type { AvatarId } from "../shared/avatars.ts";
import { RoomManager } from "../server/rooms.ts";
import type { Result } from "../server/rooms.ts";
import type { Game } from "./net.ts";

/*
 * The solo build runs the real room manager inside the page instead of talking to a server.
 * Every rule, every bot and every message is the same code the multiplayer server runs, so a
 * solo game and an online game behave identically. Nothing here touches the network.
 */

const SOLO_ROOM_CODE_LENGTH = 6;

export function useSoloGame(): Game {
  const managerRef = useRef<RoomManager | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const leavingRef = useRef(false);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closedReason, setClosedReason] = useState<string | null>(null);

  if (!managerRef.current) {
    managerRef.current = new RoomManager({
      onUpdate: (updated) => {
        const session = sessionRef.current;
        if (!session || updated.code !== session.roomCode) return;
        setRoom(managerRef.current?.viewFor(session.roomCode, session.playerId) ?? null);
      },
      onClosed: (_closed, reason) => {
        sessionRef.current = null;
        setRoom(null);
        // Leaving on purpose already takes the player home, so it needs no notice.
        if (!leavingRef.current) setClosedReason(reason);
      },
    });
  }

  // Bots play on timers, so the manager must be able to close its rooms when the page goes away.
  useEffect(() => {
    const manager = managerRef.current;
    return () => {
      leavingRef.current = true;
      manager?.shutdown();
    };
  }, []);

  const refresh = useCallback(() => {
    const session = sessionRef.current;
    setRoom(session ? (managerRef.current?.viewFor(session.roomCode, session.playerId) ?? null) : null);
  }, []);

  /** Runs one room-manager call and surfaces its message the same way the socket ack did. */
  const run = useCallback(
    (call: (manager: RoomManager, session: SessionInfo) => Result | Result<SessionInfo>): boolean => {
      const manager = managerRef.current;
      const session = sessionRef.current;
      if (!manager || !session) {
        setError("You are not in a room.");
        return false;
      }
      const result = call(manager, session);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setError(null);
      refresh();
      return true;
    },
    [refresh],
  );

  const createRoom = useCallback(
    async (name: string, settings: RoomSettings, avatarId: AvatarId) => {
      const manager = managerRef.current;
      if (!manager) return false;
      const result = manager.createRoom(name, settings, avatarId);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      sessionRef.current = result.data;
      setError(null);
      refresh();
      return true;
    },
    [refresh],
  );

  const leave = useCallback(async () => {
    const manager = managerRef.current;
    const session = sessionRef.current;
    leavingRef.current = true;
    if (manager && session) manager.leaveRoom(session.roomCode, session.playerId);
    sessionRef.current = null;
    setRoom(null);
    setError(null);
    leavingRef.current = false;
  }, []);

  return {
    // There is no connection to lose and no session to restore.
    connected: true,
    restoring: false,
    room,
    closedReason,
    error,
    clearError: useCallback(() => setError(null), []),
    dismissClosed: useCallback(() => setClosedReason(null), []),
    createRoom,
    joinRoom: useCallback(async (_name: string, code: string) => {
      setError(code.length === SOLO_ROOM_CODE_LENGTH ? "This is the solo game. Joining a friend's room needs the online version." : "No room has that code.");
      return false;
    }, []),
    updateSettings: useCallback(async (settings: RoomSettings) => run((m, s) => m.updateSettings(s.roomCode, s.playerId, settings)), [run]),
    updateAvatar: useCallback(async (avatarId: AvatarId) => run((m, s) => m.updateAvatar(s.roomCode, s.playerId, avatarId)), [run]),
    startMatch: useCallback(async () => run((m, s) => m.startMatch(s.roomCode, s.playerId)), [run]),
    startNextRound: useCallback(async () => run((m, s) => m.startNextRound(s.roomCode, s.playerId)), [run]),
    shuffleSwipe: useCallback(async () => run((m, s) => m.shuffleSwipe(s.roomCode, s.playerId)), [run]),
    endMatchEarly: useCallback(async () => run((m, s) => m.endMatchEarly(s.roomCode, s.playerId)), [run]),
    act: useCallback(async (action: GameAction) => run((m, s) => m.gameAction(s.roomCode, s.playerId, action)), [run]),
    leave,
  };
}
