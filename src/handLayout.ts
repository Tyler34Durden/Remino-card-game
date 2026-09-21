import type { Card } from "../shared/types.ts";
import { NATURAL_RANKS, SUITS } from "../engine/cards.ts";

/**
 * How a player has arranged their hand: a list of groups, each a list of card ids.
 * This is purely a view preference. It never reaches the server and has no effect on the rules.
 */
export type HandLayout = string[][];

/** Where a moved card should land. */
export type DropTarget = { kind: "card"; cardId: string; after: boolean } | { kind: "new-group" };

const rankIndex = (card: Card) => (card.rank === "JOKER" ? 99 : NATURAL_RANKS.indexOf(card.rank));
const suitIndex = (card: Card) => (card.suit === null ? 99 : SUITS.indexOf(card.suit));

/** Drops cards that left the hand, removes empty groups, and puts new cards in a trailing group. */
export function normalizeLayout(layout: HandLayout, handIds: readonly string[]): HandLayout {
  const inHand = new Set(handIds);
  const seen = new Set<string>();
  const groups: HandLayout = [];
  for (const group of layout) {
    const kept: string[] = [];
    for (const id of group) {
      if (!inHand.has(id) || seen.has(id)) continue;
      seen.add(id);
      kept.push(id);
    }
    if (kept.length > 0) groups.push(kept);
  }
  const fresh = handIds.filter((id) => !seen.has(id));
  if (fresh.length === 0) return groups;
  // New cards join the last group when the hand was never arranged, so an untouched hand stays one row.
  if (groups.length <= 1) return [[...(groups[0] ?? []), ...fresh]];
  return [...groups, fresh];
}

function without(layout: HandLayout, ids: readonly string[]): HandLayout {
  return layout.map((group) => group.filter((id) => !ids.includes(id)));
}

function clean(layout: HandLayout): HandLayout {
  return layout.filter((group) => group.length > 0);
}

/** Moves one card next to another card, or into a new group at the end. */
export function moveCard(layout: HandLayout, cardId: string, target: DropTarget): HandLayout {
  if (target.kind === "card" && target.cardId === cardId) return layout;
  const stripped = without(layout, [cardId]);
  if (target.kind === "new-group") return clean([...stripped, [cardId]]);
  const next = stripped.map((group) => {
    const index = group.indexOf(target.cardId);
    if (index === -1) return group;
    const at = target.after ? index + 1 : index;
    return [...group.slice(0, at), cardId, ...group.slice(at)];
  });
  return clean(next);
}

/** Pulls the chosen cards out of wherever they are and puts them together as the first group. */
export function groupCards(layout: HandLayout, ids: readonly string[]): HandLayout {
  if (ids.length === 0) return layout;
  const flat = layout.flat();
  const ordered = flat.filter((id) => ids.includes(id));
  return clean([ordered, ...without(layout, ids)]);
}

/** Nudges one card a single step left or right. At the edge of a group it hops into the neighbouring group. */
export function shiftCard(layout: HandLayout, cardId: string, direction: -1 | 1): HandLayout {
  const groupIndex = layout.findIndex((group) => group.includes(cardId));
  if (groupIndex === -1) return layout;
  const group = layout[groupIndex];
  const index = group.indexOf(cardId);
  const swapWith = index + direction;
  if (swapWith >= 0 && swapWith < group.length) {
    const next = group.slice();
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    return layout.map((g, i) => (i === groupIndex ? next : g));
  }
  const neighbour = groupIndex + direction;
  const stripped = without(layout, [cardId]);
  if (neighbour < 0) return clean([[cardId], ...stripped]);
  if (neighbour >= layout.length) return clean([...stripped, [cardId]]);
  const moved = stripped.map((g, i) => (i === neighbour ? (direction === 1 ? [cardId, ...g] : [...g, cardId]) : g));
  return clean(moved);
}

/** One group per suit, each in rank order. Jokers get their own group at the end. */
export function layoutBySuit(hand: readonly Card[]): HandLayout {
  const groups = new Map<number, Card[]>();
  for (const card of hand) {
    const key = suitIndex(card);
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, cards]) => cards.sort((a, b) => rankIndex(a) - rankIndex(b)).map((c) => c.id));
}

/** One group per rank that is held at least twice. Every other card goes in a final group in rank order. */
export function layoutByRank(hand: readonly Card[]): HandLayout {
  const sorted = hand.slice().sort((a, b) => rankIndex(a) - rankIndex(b) || suitIndex(a) - suitIndex(b));
  const counts = new Map<string, number>();
  for (const card of sorted) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const pairs = new Map<string, string[]>();
  const singles: string[] = [];
  for (const card of sorted) {
    if (card.rank !== "JOKER" && (counts.get(card.rank) ?? 0) >= 2) pairs.set(card.rank, [...(pairs.get(card.rank) ?? []), card.id]);
    else singles.push(card.id);
  }
  return clean([...pairs.values(), singles]);
}

export function loadLayout(key: string): HandLayout {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((g): g is string[] => Array.isArray(g) && g.every((id) => typeof id === "string"));
  } catch {
    return [];
  }
}

export function saveLayout(key: string, layout: HandLayout): void {
  try {
    localStorage.setItem(key, JSON.stringify(layout));
  } catch {
    // The arrangement then simply lasts until the page is reloaded.
  }
}
