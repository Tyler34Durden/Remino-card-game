import type { Card, JokerAssignments, JokerRef, MeldCard, MeldType, NaturalRef, Suit, TableMeld } from "../shared/types.ts";
import { SUITS, isJoker, naturalOf, rankAtPosition, rankNumber, runPositionValue, sameNatural, setRankValue } from "./cards.ts";

export const MIN_MELD_SIZE = 3;
/** A new meld needs at least this many natural cards, so its meaning is never pure guesswork. */
export const MIN_NATURAL_CARDS = 2;
/**
 * Opening points for a card placed on a meld that is already on the table.
 * Only brand-new melds count toward opening, so additions and joker swaps are worth nothing.
 */
export const ADDITION_OPENING_POINTS = 0;

export interface MeldInterpretation {
  type: MeldType;
  cards: MeldCard[];
  runStart: number | null;
  /** Opening value of the whole meld at normal card values. */
  points: number;
}

/**
 * Places jokers on the open slots. Jokers named in `jokerAs` must land on the slot
 * they were assigned. Returns null when an explicit assignment cannot be honoured.
 */
function assignJokers(jokers: readonly Card[], slots: readonly NaturalRef[], jokerAs?: JokerAssignments): MeldCard[] | null {
  if (jokers.length !== slots.length) return null;
  const remaining = slots.slice();
  const placed: MeldCard[] = [];
  const free: Card[] = [];
  for (const joker of jokers) {
    const wanted = jokerAs?.[joker.id];
    if (!wanted) {
      free.push(joker);
      continue;
    }
    const index = remaining.findIndex((slot) => sameNatural(slot, wanted));
    if (index === -1) return null;
    placed.push({ card: joker, represents: remaining[index] });
    remaining.splice(index, 1);
  }
  free.forEach((joker, i) => placed.push({ card: joker, represents: remaining[i] }));
  return placed;
}

export function refOf(meldCard: MeldCard): JokerRef {
  if (meldCard.represents) return meldCard.represents;
  return { rank: meldCard.card.rank as NaturalRef["rank"], suit: meldCard.card.suit as Suit };
}

/** Natural cards in suit order, then the jokers. */
function sortSet(cards: MeldCard[]): MeldCard[] {
  const order = (c: MeldCard) => {
    const suit = refOf(c).suit;
    return suit === null ? SUITS.length : SUITS.indexOf(suit);
  };
  return cards.slice().sort((a, b) => order(a) - order(b));
}

function setPoints(cards: readonly MeldCard[]): number {
  return cards.reduce((sum, c) => sum + setRankValue(refOf(c).rank), 0);
}

function runPoints(start: number, length: number): number {
  let sum = 0;
  for (let p = start; p < start + length; p++) sum += runPositionValue(p);
  return sum;
}

/** Possible run positions for a natural card. An ace may sit at 1 or at 14. */
function positionsOf(card: Card): number[] {
  if (card.rank === "A") return [1, 14];
  return [rankNumber(card.rank as NaturalRef["rank"])];
}

/**
 * A set holds one natural card per suit. A joker in a set has no suit of its own:
 * it stands for whichever suits are still missing, so there is only ever one reading.
 */
function interpretSet(naturals: Card[], jokers: Card[], fixed: MeldCard[], jokerAs?: JokerAssignments): MeldInterpretation[] {
  const fixedNaturals = fixed.filter((c) => c.represents === null);
  const refs = [...fixed.map((c) => refOf(c)), ...naturals.map((c) => ({ rank: c.rank, suit: c.suit }) as JokerRef)];
  if (refs.length === 0) return [];
  const rank = refs[0].rank;
  if (refs.some((ref) => ref.rank !== rank)) return [];
  const naturalSuits = [...fixedNaturals.map((c) => c.card.suit), ...naturals.map((c) => c.suit)];
  if (new Set(naturalSuits).size !== naturalSuits.length) return [];
  const total = fixed.length + naturals.length + jokers.length;
  if (total < MIN_MELD_SIZE || total > SUITS.length) return [];
  // An explicit assignment is only checked for its rank. The suit of a set joker is never fixed.
  if (jokers.some((joker) => jokerAs?.[joker.id] && jokerAs[joker.id].rank !== rank)) return [];
  const placed: MeldCard[] = jokers.map((card) => ({ card, represents: { rank, suit: null } }));
  const cards = sortSet([...fixed, ...naturals.map((card) => ({ card, represents: null })), ...placed]);
  return [{ type: "set", cards, runStart: null, points: setPoints(cards) }];
}

/**
 * Tries every window of the right length that contains the fixed window.
 * `fixed` holds cards already on the table with their positions.
 */
function interpretRun(
  suit: Suit,
  naturals: Card[],
  jokers: Card[],
  fixed: { card: MeldCard; position: number }[],
  jokerAs?: JokerAssignments,
): MeldInterpretation[] {
  if (naturals.some((card) => card.suit !== suit)) return [];
  const length = fixed.length + naturals.length + jokers.length;
  if (length < MIN_MELD_SIZE || length > 13) return [];
  const fixedStart = fixed.length > 0 ? Math.min(...fixed.map((f) => f.position)) : null;
  const fixedEnd = fixed.length > 0 ? Math.max(...fixed.map((f) => f.position)) : null;
  const results: MeldInterpretation[] = [];
  for (let start = 1; start + length - 1 <= 14; start++) {
    const end = start + length - 1;
    if (fixedStart !== null && fixedEnd !== null && (start > fixedStart || end < fixedEnd)) continue;
    const slots = new Map<number, MeldCard>();
    for (const f of fixed) slots.set(f.position, f.card);
    let fits = true;
    for (const card of naturals) {
      const position = positionsOf(card).find((p) => p >= start && p <= end && !slots.has(p));
      if (position === undefined) {
        fits = false;
        break;
      }
      slots.set(position, { card, represents: null });
    }
    if (!fits) continue;
    const open: NaturalRef[] = [];
    for (let p = start; p <= end; p++) {
      if (!slots.has(p)) open.push({ rank: rankAtPosition(p), suit });
    }
    const placed = assignJokers(jokers, open, jokerAs);
    if (!placed) continue;
    for (const joker of placed) {
      for (let p = start; p <= end; p++) {
        if (!slots.has(p) && joker.represents && rankAtPosition(p) === joker.represents.rank) {
          slots.set(p, joker);
          break;
        }
      }
    }
    const cards: MeldCard[] = [];
    for (let p = start; p <= end; p++) {
      const slot = slots.get(p);
      if (slot) cards.push(slot);
    }
    if (cards.length !== length) continue;
    results.push({ type: "run", cards, runStart: start, points: runPoints(start, length) });
  }
  return results;
}

function byPointsDescending(list: MeldInterpretation[]): MeldInterpretation[] {
  return list.sort((a, b) => b.points - a.points);
}

/** Every legal reading of a brand-new meld, best opening value first. Empty means invalid. */
export function interpretNewMeld(cards: readonly Card[], jokerAs?: JokerAssignments): MeldInterpretation[] {
  const naturals = cards.filter((c) => !isJoker(c));
  const jokers = cards.filter(isJoker);
  if (cards.length < MIN_MELD_SIZE || naturals.length < MIN_NATURAL_CARDS) return [];
  const results = interpretSet(naturals, jokers, [], jokerAs);
  const suit = naturals[0].suit as Suit;
  results.push(...interpretRun(suit, naturals, jokers, [], jokerAs));
  return byPointsDescending(results);
}

/** Every legal result of adding cards to a table meld. Cards already on the table never move. */
export function interpretAddition(meld: TableMeld, cards: readonly Card[], jokerAs?: JokerAssignments): MeldInterpretation[] {
  if (cards.length === 0) return [];
  const naturals = cards.filter((c) => !isJoker(c));
  const jokers = cards.filter(isJoker);
  if (meld.type === "set") return interpretSet(naturals, jokers, meld.cards, jokerAs);
  const start = meld.runStart ?? 1;
  const suit = refOf(meld.cards[0]).suit as Suit;
  const fixed = meld.cards.map((card, i) => ({ card, position: start + i }));
  return byPointsDescending(interpretRun(suit, naturals, jokers, fixed, jokerAs));
}

/**
 * Whether a natural card may take the place of a table joker.
 * In a run only the exact card fits. In a set any card of the right rank and a missing suit fits.
 */
export function canReplaceJoker(meld: TableMeld, jokerId: string, card: Card): boolean {
  const slot = meld.cards.find((c) => c.card.id === jokerId);
  const natural = naturalOf(card);
  if (!slot || !slot.represents || !isJoker(slot.card) || !natural) return false;
  if (natural.rank !== slot.represents.rank) return false;
  if (slot.represents.suit !== null) return natural.suit === slot.represents.suit;
  return !meld.cards.some((c) => c.represents === null && c.card.suit === natural.suit);
}

/** A readable description of which cards can replace a table joker. */
export function replacementHint(meld: TableMeld, jokerId: string): string {
  const slot = meld.cards.find((c) => c.card.id === jokerId);
  if (!slot || !slot.represents) return "That joker is not in the chosen meld.";
  if (slot.represents.suit !== null) return `Only the ${slot.represents.rank} of ${slot.represents.suit} can replace that joker.`;
  return `Only a ${slot.represents.rank} in a suit missing from the set can replace that joker.`;
}

/** Whether a single card could be added to any meld on the table. */
export function fitsTableMeld(card: Card, melds: readonly TableMeld[]): boolean {
  return !isJoker(card) && melds.some((meld) => interpretAddition(meld, [card]).length > 0);
}

/**
 * The cards a player may legally discard. A card that fits a meld on the table may not be thrown away.
 * If every card in hand fits the table, all of them become legal again, so a turn can always end.
 */
export function legalDiscards(hand: readonly Card[], melds: readonly TableMeld[]): Card[] {
  // A joker may be discarded only as the very last card, which ends the round.
  if (hand.length === 1) return hand.slice();
  const naturals = hand.filter((c) => !isJoker(c));
  const free = naturals.filter((c) => !fitsTableMeld(c, melds));
  return free.length > 0 ? free : naturals;
}

/** Why a group of cards is not a valid new meld. Used for helpful rejection messages. */
export function explainInvalidMeld(cards: readonly Card[]): string {
  const naturals = cards.filter((c) => !isJoker(c));
  if (cards.length < MIN_MELD_SIZE) return "A meld needs at least three cards.";
  if (naturals.length < MIN_NATURAL_CARDS) return "A meld needs at least two natural cards.";
  const sameRank = naturals.every((c) => c.rank === naturals[0].rank);
  const sameSuit = naturals.every((c) => c.suit === naturals[0].suit);
  if (sameRank && sameSuit) return "Identical cards cannot share a meld.";
  if (sameRank) {
    if (new Set(naturals.map((c) => c.suit)).size !== naturals.length) return "A set cannot contain two cards of the same suit.";
    if (cards.length > 4) return "A set cannot hold more than four cards.";
  }
  if (sameSuit) return "A run needs consecutive cards of one suit, and it cannot wrap from ace back to 2.";
  return "These cards are neither a same-rank set nor a suited run.";
}
