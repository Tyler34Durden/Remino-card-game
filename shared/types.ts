// Types shared by the rules engine, the server, and the client.
import type { AvatarId } from "./avatars.ts";

export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type NaturalRank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Rank = NaturalRank | "JOKER";

/** One physical card. Two decks are used, so rank and suit repeat, but ids never do. */
export interface Card {
  id: string;
  deckIndex: number;
  suit: Suit | null;
  rank: Rank;
}

/** The natural card that a joker stands for. */
export interface NaturalRef {
  rank: NaturalRank;
  suit: Suit;
}

/**
 * What a table joker stands for. In a run it is one exact card.
 * In a same-rank set the suit is null: the joker stands for any suit that is still missing from the set.
 */
export interface JokerRef {
  rank: NaturalRank;
  suit: Suit | null;
}

/** A card lying in a table meld. Jokers always record what they represent. */
export interface MeldCard {
  card: Card;
  represents: JokerRef | null;
}

export type MeldType = "set" | "run";

export interface TableMeld {
  id: string;
  ownerSeat: number;
  type: MeldType;
  /** Runs are ordered low to high. Sets are ordered by suit. */
  cards: MeldCard[];
  /** Runs only: position of the first card. 1 is a low ace, 14 is a high ace. */
  runStart: number | null;
}

export type MatchFormat = "score-limit" | "fixed-rounds";
export type SeatCount = 4 | 5 | 6;

export interface RoomSettings {
  seatCount: SeatCount;
  /** How many jokers are shuffled into the two decks. 0 plays without jokers. */
  jokerCount: number;
  openingRequired: boolean;
  openingThreshold: number;
  matchFormat: MatchFormat;
  scoreLimit: number;
  roundCount: number;
}

export const MAX_JOKERS = 8;

export const DEFAULT_SETTINGS: RoomSettings = {
  seatCount: 4,
  jokerCount: 4,
  openingRequired: true,
  openingThreshold: 65,
  matchFormat: "score-limit",
  scoreLimit: 101,
  roundCount: 5,
};

// ---------------------------------------------------------------------------
// Table plays
// ---------------------------------------------------------------------------

/** Optional explicit joker assignments, keyed by joker card id. */
export type JokerAssignments = Record<string, NaturalRef>;

export type Play =
  | { kind: "new-meld"; cardIds: readonly string[]; jokerAs?: JokerAssignments }
  | { kind: "add"; meldId: string; cardIds: readonly string[]; jokerAs?: JokerAssignments }
  | { kind: "replace-joker"; meldId: string; jokerId: string; cardId: string };

export type GameAction =
  | { type: "DRAW_FROM_STOCK" }
  | { type: "TAKE_DISCARD_AND_PLAY"; plays: readonly Play[] }
  | { type: "PLAY"; plays: readonly Play[] }
  | { type: "DISCARD_CARD"; cardId: string }
  | { type: "PASS_TURN" };

export type TurnPhase = "draw" | "play";
export type CardSource = "stock" | "discard";

// ---------------------------------------------------------------------------
// Player-specific room view
// ---------------------------------------------------------------------------

export type RoomStatus = "lobby" | "playing" | "round-end" | "match-end";
export type SeatKind = "empty" | "human" | "bot";

export interface PublicSeat {
  seat: number;
  avatarId: AvatarId;
  kind: SeatKind;
  name: string;
  playerId: string | null;
  isHost: boolean;
  connected: boolean;
  /** A bot is temporarily playing for a disconnected human. */
  botControlled: boolean;
  /** Name of a late joiner who takes this seat when the next round starts. */
  reservedFor: string | null;
  cardCount: number;
  opened: boolean;
  score: number;
  /** Consecutive round wins in this match; used only for a visual badge. */
  roundWinStreak: number;
}

export interface RoundResult {
  roundNumber: number;
  winnerSeat: number | null;
  /** True when nobody could draw and the round ended without a winner. */
  blocked: boolean;
  hands: Card[][];
  penalties: number[];
}

export interface PublicRoomState {
  code: string;
  status: RoomStatus;
  version: number;
  settings: RoomSettings;
  seats: PublicSeat[];
  viewer: {
    playerId: string;
    name: string;
    seat: number | null;
    isHost: boolean;
    /** Late joiner waiting for the next round. */
    waiting: boolean;
  };
  hand: Card[];
  /** Card the viewer drew from the stock this turn, if any. */
  drawnCardId: string | null;
  roundNumber: number;
  tiebreak: boolean;
  dealerSeat: number | null;
  /** Cosmetic pre-deal ritual; the server has already fixed the deck order. */
  shuffleRitual: { phase: "shuffling" | "dealing"; swipes: number; dealerSeat: number } | null;
  activeSeat: number | null;
  turnPhase: TurnPhase;
  cardSource: CardSource | null;
  stockCount: number;
  discardCount: number;
  topDiscard: Card | null;
  melds: TableMeld[];
  /** Number the server gives the next new meld. Lets the client preview staged plays with real ids. */
  nextMeldId: number;
  lastResult: RoundResult | null;
  matchWinnerSeat: number | null;
  /** True when the host may end the match now: one seat has the uniquely lowest score. */
  canEndEarly: boolean;
  log: string[];
}

export interface SessionInfo {
  roomCode: string;
  playerId: string;
  token: string;
}

export type AckResponse<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export type Ack<T = undefined> = (response: AckResponse<T>) => void;

export interface GameActionPayload {
  action: GameAction;
  /** When given, the server rejects the action if the room has moved on. */
  expectedVersion?: number;
}

export interface ClientToServerEvents {
  create_room: (payload: { name: string; settings: RoomSettings; avatarId?: AvatarId }, ack: Ack<SessionInfo>) => void;
  join_room: (payload: { name: string; roomCode: string; avatarId?: AvatarId }, ack: Ack<SessionInfo>) => void;
  reconnect_player: (session: SessionInfo, ack: Ack<SessionInfo>) => void;
  update_avatar: (avatarId: AvatarId, ack: Ack) => void;
  update_settings: (settings: RoomSettings, ack: Ack) => void;
  start_match: (ack: Ack) => void;
  game_action: (payload: GameActionPayload, ack: Ack) => void;
  start_next_round: (ack: Ack) => void;
  shuffle_swipe: (ack: Ack) => void;
  end_match_early: (ack: Ack) => void;
  reclaim_bot_seat: (ack: Ack) => void;
  leave_room: (ack: Ack) => void;
}

export interface ServerToClientEvents {
  room_state: (state: PublicRoomState) => void;
  room_closed: (reason: string) => void;
  notice: (message: string) => void;
}
