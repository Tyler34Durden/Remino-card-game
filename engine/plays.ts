import type { Card, Play, RoomSettings, TableMeld } from "../shared/types.ts";
import { cardLabel, isJoker } from "./cards.ts";
import { ADDITION_OPENING_POINTS, canReplaceJoker, explainInvalidMeld, interpretAddition, interpretNewMeld, replacementHint } from "./melds.ts";

/**
 * How the player got their card this turn.
 * - take-discard: the plays are the transaction that proves the taken discard is used.
 * - after-discard: further plays later in a turn that began by taking the discard.
 * - after-stock: plays after a stock draw. Only a player who has already opened may play, and then every kind of play is allowed.
 */
export type PlayMode = "take-discard" | "after-discard" | "after-stock";

export interface PlayContext {
  seat: number;
  /** For take-discard this already includes the taken card. */
  hand: Card[];
  melds: TableMeld[];
  opened: boolean;
  settings: RoomSettings;
  mode: PlayMode;
  /** The taken discard. It must be used in a new meld together with cards from the hand. */
  requiredCardId: string | null;
  nextMeldId: number;
}

export type PlayResult =
  | { ok: true; hand: Card[]; melds: TableMeld[]; openingPoints: number; nextMeldId: number; descriptions: string[] }
  | { ok: false; error: string };

function fail(error: string): PlayResult {
  return { ok: false, error };
}

function takeFromHand(hand: Card[], cardIds: readonly string[]): { taken: Card[]; rest: Card[] } | null {
  if (new Set(cardIds).size !== cardIds.length) return null;
  const taken: Card[] = [];
  for (const id of cardIds) {
    const card = hand.find((c) => c.id === id);
    if (!card) return null;
    taken.push(card);
  }
  return { taken, rest: hand.filter((c) => !cardIds.includes(c.id)) };
}

/**
 * Validates a list of table plays in order and returns the resulting hand and table.
 * Nothing is mutated. The whole list is accepted or rejected as one unit.
 * With `partial`, the end-of-transaction checks are skipped.
 */
export function validatePlays(context: PlayContext, plays: readonly Play[], options: { partial?: boolean } = {}): PlayResult {
  if (plays.length === 0 && !options.partial) return fail("Choose at least one table play.");
  if (context.mode === "after-stock" && !context.opened) {
    return fail("You have not opened yet. Opening requires taking the previous discard.");
  }

  let hand = context.hand.slice();
  let melds = context.melds.map((m) => ({ ...m, cards: m.cards.slice() }));
  let nextMeldId = context.nextMeldId;
  let openingPoints = 0;
  let requiredUsed = false;
  let jokerAddedToTable = false;
  const descriptions: string[] = [];
  const required = context.requiredCardId;
  const mustBeNewMeld = "The card you take from the discard pile must go into a new meld with cards from your hand. It cannot be added to a meld on the table.";

  for (const play of plays) {
    if (play.kind === "new-meld") {
      const picked = takeFromHand(hand, play.cardIds);
      if (!picked) return fail("A selected card is not in your hand.");
      const readings = interpretNewMeld(picked.taken, play.jokerAs);
      if (readings.length === 0) return fail(explainInvalidMeld(picked.taken));
      const reading = readings[0];
      if (required && play.cardIds.includes(required)) requiredUsed = true;
      melds.push({ id: `m${nextMeldId}`, ownerSeat: context.seat, type: reading.type, cards: reading.cards, runStart: reading.runStart });
      nextMeldId += 1;
      openingPoints += reading.points;
      hand = picked.rest;
      descriptions.push(`a ${reading.type} of ${reading.cards.length}`);
    } else if (play.kind === "add") {
      const index = melds.findIndex((m) => m.id === play.meldId);
      if (index === -1) return fail("That meld is no longer on the table.");
      if (required && play.cardIds.includes(required)) return fail(mustBeNewMeld);
      const picked = takeFromHand(hand, play.cardIds);
      if (!picked || picked.taken.length === 0) return fail("A selected card is not in your hand.");
      if (picked.taken.some(isJoker)) jokerAddedToTable = true;
      const readings = interpretAddition(melds[index], picked.taken, play.jokerAs);
      if (readings.length === 0) {
        return fail(`${picked.taken.map(cardLabel).join(" ")} cannot be added to that ${melds[index].type}.`);
      }
      const reading = readings[0];
      melds[index] = { ...melds[index], cards: reading.cards, runStart: reading.runStart };
      openingPoints += ADDITION_OPENING_POINTS * picked.taken.length;
      hand = picked.rest;
      descriptions.push(`${picked.taken.length} card${picked.taken.length === 1 ? "" : "s"} added to a ${reading.type}`);
    } else if (play.kind === "replace-joker") {
      const index = melds.findIndex((m) => m.id === play.meldId);
      if (index === -1) return fail("That meld is no longer on the table.");
      const slot = melds[index].cards.findIndex((c) => c.card.id === play.jokerId);
      const target = slot === -1 ? null : melds[index].cards[slot];
      if (!target || !isJoker(target.card) || !target.represents) return fail("That joker is not in the chosen meld.");
      if (required && play.cardId === required) return fail(mustBeNewMeld);
      const picked = takeFromHand(hand, [play.cardId]);
      if (!picked) return fail("A selected card is not in your hand.");
      if (!canReplaceJoker(melds[index], play.jokerId, picked.taken[0])) return fail(replacementHint(melds[index], play.jokerId));
      const cards = melds[index].cards.slice();
      cards[slot] = { card: picked.taken[0], represents: null };
      melds[index] = { ...melds[index], cards };
      hand = [...picked.rest, target.card];
      // The replacing card lands on a table meld, so it counts like any other added card.
      openingPoints += ADDITION_OPENING_POINTS;
      descriptions.push(`a joker replaced with ${cardLabel(picked.taken[0])}`);
    } else {
      return fail("Unknown table play.");
    }
  }

  // A partial check is used for previews while the player is still building their plays.
  if (options.partial) return { ok: true, hand, melds, openingPoints, nextMeldId, descriptions };
  if (required && !requiredUsed) return fail(mustBeNewMeld);
  if (context.mode === "take-discard" && !context.opened && context.settings.openingRequired) {
    if (openingPoints < context.settings.openingThreshold) {
      return fail(`Opening needs ${context.settings.openingThreshold} points. These plays total ${openingPoints}.`);
    }
  }
  if (hand.length === 0) return fail("You must keep one card for your final discard.");
  // A joker may join a meld on the table only in the turn that ends the round: one card must be left, and it is discarded.
  if (jokerAddedToTable && hand.length !== 1) {
    return fail("A joker can be added to a meld on the table only in the turn you go out, leaving exactly one card to discard.");
  }
  return { ok: true, hand, melds, openingPoints, nextMeldId, descriptions };
}
