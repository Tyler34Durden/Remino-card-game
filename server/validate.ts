import type { GameAction, JokerAssignments, Play, RoomSettings } from "../shared/types.ts";
import { NATURAL_RANKS, SUITS } from "../engine/cards.ts";

// Clients are untrusted. Everything that arrives over the socket is checked here before it reaches the rules engine.

const MAX_PLAYS = 30;
const MAX_CARDS_PER_PLAY = 14;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 40;
}

function parseCardIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CARDS_PER_PLAY) return null;
  return value.every(isId) ? (value as string[]) : null;
}

function parseJokerAs(value: unknown): JokerAssignments | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 4) return null;
  const result: JokerAssignments = {};
  for (const [id, ref] of entries) {
    if (!isId(id) || !isRecord(ref)) return null;
    const rank = NATURAL_RANKS.find((r) => r === ref.rank);
    const suit = SUITS.find((s) => s === ref.suit);
    if (!rank || !suit) return null;
    result[id] = { rank, suit };
  }
  return result;
}

function parsePlay(value: unknown): Play | null {
  if (!isRecord(value)) return null;
  if (value.kind === "new-meld" || value.kind === "add") {
    const cardIds = parseCardIds(value.cardIds);
    const jokerAs = parseJokerAs(value.jokerAs);
    if (!cardIds || jokerAs === null) return null;
    if (value.kind === "new-meld") return { kind: "new-meld", cardIds, jokerAs };
    return isId(value.meldId) ? { kind: "add", meldId: value.meldId, cardIds, jokerAs } : null;
  }
  if (value.kind === "replace-joker") {
    if (!isId(value.meldId) || !isId(value.jokerId) || !isId(value.cardId)) return null;
    return { kind: "replace-joker", meldId: value.meldId, jokerId: value.jokerId, cardId: value.cardId };
  }
  return null;
}

function parsePlays(value: unknown): Play[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PLAYS) return null;
  const plays = value.map(parsePlay);
  return plays.every((p): p is Play => p !== null) ? plays : null;
}

export function parseAction(value: unknown): GameAction | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "DRAW_FROM_STOCK":
      return { type: "DRAW_FROM_STOCK" };
    case "PASS_TURN":
      return { type: "PASS_TURN" };
    case "DISCARD_CARD":
      return isId(value.cardId) ? { type: "DISCARD_CARD", cardId: value.cardId } : null;
    case "TAKE_DISCARD_AND_PLAY":
    case "PLAY": {
      const plays = parsePlays(value.plays);
      return plays ? { type: value.type, plays } : null;
    }
    default:
      return null;
  }
}

export function parseSettings(value: unknown): RoomSettings | null {
  if (!isRecord(value)) return null;
  const { seatCount, jokerCount, openingRequired, openingThreshold, matchFormat, scoreLimit, roundCount } = value;
  if (seatCount !== 4 && seatCount !== 5 && seatCount !== 6) return null;
  if (typeof jokerCount !== "number" || typeof openingRequired !== "boolean") return null;
  if (matchFormat !== "score-limit" && matchFormat !== "fixed-rounds") return null;
  if (typeof openingThreshold !== "number" || typeof scoreLimit !== "number" || typeof roundCount !== "number") return null;
  return { seatCount, jokerCount, openingRequired, openingThreshold, matchFormat, scoreLimit, roundCount };
}
