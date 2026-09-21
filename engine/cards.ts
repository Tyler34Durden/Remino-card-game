import type { Card, JokerRef, NaturalRank, NaturalRef, Rank, Suit } from "../shared/types.ts";

export const SUITS: readonly Suit[] = ["clubs", "diamonds", "hearts", "spades"];
export const NATURAL_RANKS: readonly NaturalRank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const DECK_COUNT = 2;
export const HAND_SIZE = 14;
export const JOKER_PENALTY = 25;

export function isJoker(card: Card): boolean {
  return card.rank === "JOKER";
}

/** Builds the two-deck pack: 104 cards plus the chosen number of jokers. Every card has a unique id. */
export function buildDeck(jokerCount: number): Card[] {
  const cards: Card[] = [];
  for (let deckIndex = 0; deckIndex < DECK_COUNT; deckIndex++) {
    for (const suit of SUITS) {
      for (const rank of NATURAL_RANKS) {
        cards.push({ id: `d${deckIndex}-${suit}-${rank}`, deckIndex, suit, rank });
      }
    }
  }
  for (let j = 0; j < jokerCount; j++) {
    cards.push({ id: `joker-${j}`, deckIndex: j % DECK_COUNT, suit: null, rank: "JOKER" });
  }
  return cards;
}

/** One step of the mulberry32 generator. Returns a float in [0, 1) and the next state. */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}

/** Deterministic Fisher-Yates shuffle. Does not mutate the input. */
export function shuffle<T>(items: readonly T[], rngState: number): { items: T[]; rngState: number } {
  const result = items.slice();
  let state = rngState;
  for (let i = result.length - 1; i > 0; i--) {
    const step = nextRandom(state);
    state = step.state;
    const j = Math.floor(step.value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return { items: result, rngState: state };
}

/** Rank number with a low ace: A=1, 2..10, J=11, Q=12, K=13. */
export function rankNumber(rank: NaturalRank): number {
  return NATURAL_RANKS.indexOf(rank) + 1;
}

/** Rank at a run position. Position 1 is a low ace and 14 is a high ace. */
export function rankAtPosition(position: number): NaturalRank {
  return position === 14 ? "A" : NATURAL_RANKS[position - 1];
}

/** Opening value of a card at a run position. A low ace is 1 and a high ace is 10. */
export function runPositionValue(position: number): number {
  if (position === 1) return 1;
  if (position >= 11) return 10;
  return position;
}

/** Opening value of a rank inside a same-rank set. */
export function setRankValue(rank: NaturalRank): number {
  if (rank === "A" || rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

/** Penalty for a card left in hand when a round ends. */
export function penaltyValue(card: Card): number {
  if (card.rank === "JOKER") return JOKER_PENALTY;
  return setRankValue(card.rank);
}

export function handPenalty(hand: readonly Card[]): number {
  return hand.reduce((sum, card) => sum + penaltyValue(card), 0);
}

export function sameNatural(a: NaturalRef, b: NaturalRef): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

export function naturalOf(card: Card): NaturalRef | null {
  if (card.rank === "JOKER" || card.suit === null) return null;
  return { rank: card.rank as NaturalRank, suit: card.suit };
}

const SUIT_SYMBOL: Record<Suit, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };

export function cardLabel(card: Card): string {
  if (card.rank === "JOKER" || card.suit === null) return "Joker";
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

/** A joker in a set has no fixed suit, so only its rank is shown. */
export function refLabel(ref: JokerRef): string {
  return ref.suit === null ? ref.rank : `${ref.rank}${SUIT_SYMBOL[ref.suit]}`;
}

export function isRank(value: string): value is Rank {
  return value === "JOKER" || (NATURAL_RANKS as readonly string[]).includes(value);
}
