import type { Card, MeldType } from "../shared/types.ts";
import { explainInvalidMeld, interpretNewMeld } from "../engine/melds.ts";

/*
 * The meld calculator. It only looks at the player's own hand and the face-up discard,
 * and it uses the same meld rules as the server, so what it promises is what the server accepts.
 * Nothing here is sent anywhere. It is a planning aid.
 */

export interface MeldValue {
  valid: boolean;
  type: MeldType | null;
  /** Opening points at normal card values. 0 when the cards are not a meld. */
  points: number;
  /** Why the cards are not a meld. Null when they are. */
  reason: string | null;
}

export interface GroupPlan extends MeldValue {
  cardIds: string[];
  /** Points of this group if the face-up discard joined it, when that makes a valid meld. */
  pointsWithDiscard: number | null;
}

export interface HandPlan {
  groups: GroupPlan[];
  /** Points of every group that is already a valid meld on its own. */
  readyPoints: number;
  /**
   * Best total if the face-up discard is taken and put into one group.
   * Null when no group can use the discard. Opening always needs this, because the discard must go into a new meld.
   */
  pointsWithDiscard: number | null;
  /** Index of the group that should receive the discard for that best total. */
  discardGroup: number | null;
}

/** Values one set of cards as a brand-new meld. */
export function valueOf(cards: readonly Card[]): MeldValue {
  if (cards.length < 3) return { valid: false, type: null, points: 0, reason: null };
  const readings = interpretNewMeld(cards);
  if (readings.length === 0) return { valid: false, type: null, points: 0, reason: explainInvalidMeld(cards) };
  // Readings come best first, which matches what the server picks when the player does not choose.
  return { valid: true, type: readings[0].type, points: readings[0].points, reason: null };
}

/** Values every arranged group, alone and together with the face-up discard. */
export function planHand(groups: readonly (readonly Card[])[], topDiscard: Card | null): HandPlan {
  const plans: GroupPlan[] = groups.map((cards) => {
    const alone = valueOf(cards);
    let pointsWithDiscard: number | null = null;
    if (topDiscard && cards.length >= 2) {
      const joined = valueOf([...cards, topDiscard]);
      if (joined.valid) pointsWithDiscard = joined.points;
    }
    return { ...alone, cardIds: cards.map((c) => c.id), pointsWithDiscard };
  });

  const readyPoints = plans.reduce((sum, plan) => sum + plan.points, 0);
  let pointsWithDiscard: number | null = null;
  let discardGroup: number | null = null;
  plans.forEach((plan, index) => {
    if (plan.pointsWithDiscard === null) return;
    const total = readyPoints - plan.points + plan.pointsWithDiscard;
    if (pointsWithDiscard === null || total > pointsWithDiscard) {
      pointsWithDiscard = total;
      discardGroup = index;
    }
  });
  return { groups: plans, readyPoints, pointsWithDiscard, discardGroup };
}
