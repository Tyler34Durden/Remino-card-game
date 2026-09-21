import type { Card, NaturalRank, RoomSettings, Suit, TableMeld } from "../shared/types.ts";
import { DEFAULT_SETTINGS } from "../shared/types.ts";
import { createMatch } from "../engine/game.ts";
import type { MatchState } from "../engine/game.ts";
import { interpretNewMeld } from "../engine/melds.ts";

const SUIT_BY_LETTER: Record<string, Suit> = { C: "clubs", D: "diamonds", H: "hearts", S: "spades" };

/** Builds a card from a short code such as "10H", "AS", or "JK" for a joker. */
export function card(code: string, deckIndex = 0): Card {
  if (code === "JK") return { id: `joker-${deckIndex}`, deckIndex, suit: null, rank: "JOKER" };
  const suit = SUIT_BY_LETTER[code.slice(-1)];
  const rank = code.slice(0, -1) as NaturalRank;
  return { id: `d${deckIndex}-${suit}-${rank}`, deckIndex, suit, rank };
}

export function cards(codes: string, deckIndex = 0): Card[] {
  return codes.split(" ").filter(Boolean).map((code) => card(code, deckIndex));
}

export function joker(n: number): Card {
  return { id: `joker-${n}`, deckIndex: n % 2, suit: null, rank: "JOKER" };
}

export function tableMeld(id: string, ownerSeat: number, meldCards: Card[]): TableMeld {
  const reading = interpretNewMeld(meldCards)[0];
  if (!reading) throw new Error(`Not a valid meld: ${meldCards.map((c) => c.id).join(" ")}`);
  return { id, ownerSeat, type: reading.type, cards: reading.cards, runStart: reading.runStart };
}

export interface Scenario {
  settings?: Partial<RoomSettings>;
  hands: Card[][];
  discard?: Card[];
  stock?: Card[];
  activeSeat?: number;
  opened?: boolean[];
  melds?: TableMeld[];
  scores?: number[];
}

/** A match with hand-picked hands, piles, and table. Missing hands are padded with filler cards. */
export function scenario(options: Scenario): MatchState {
  const settings: RoomSettings = { ...DEFAULT_SETTINGS, ...options.settings };
  const state = createMatch(settings, 7);
  const filler = cards("2C 4D 6H 8S 10C QD");
  state.round.hands = Array.from({ length: settings.seatCount }, (_, seat) => options.hands[seat] ?? filler.map((c) => ({ ...c, id: `${c.id}-f${seat}` })));
  state.round.discard = options.discard ?? [card("3C", 1)];
  state.round.stock = options.stock ?? cards("9D 9H 9S 5C 5D", 1);
  state.round.activeSeat = options.activeSeat ?? 0;
  state.round.opened = options.opened ?? Array.from({ length: settings.seatCount }, () => false);
  state.round.melds = options.melds ?? [];
  state.round.nextMeldId = 100;
  if (options.scores) state.scores = options.scores.slice();
  return state;
}

export function expectOk<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`Expected success but got: ${(result as unknown as { error: string }).error}`);
  return result as Extract<T, { ok: true }>;
}

export function expectError<T extends { ok: boolean }>(result: T): string {
  if (result.ok) throw new Error("Expected the action to be rejected.");
  return (result as unknown as { error: string }).error;
}
