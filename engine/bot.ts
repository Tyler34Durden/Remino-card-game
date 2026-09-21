import type { Card, CardSource, GameAction, Play, RoomSettings, TableMeld, TurnPhase } from "../shared/types.ts";
import { SUITS, isJoker, penaltyValue, rankNumber } from "./cards.ts";
import type { MatchState } from "./game.ts";
import { canReplaceJoker, interpretAddition, interpretNewMeld, legalDiscards } from "./melds.ts";
import { validatePlays } from "./plays.ts";
import type { PlayMode } from "./plays.ts";

/** Everything a bot may look at. It never sees other hands or the stock order. */
export interface BotView {
  seat: number;
  hand: Card[];
  melds: TableMeld[];
  opened: boolean;
  settings: RoomSettings;
  topDiscard: Card | null;
  phase: TurnPhase;
  source: CardSource | null;
  nextMeldId: number;
}

export function botViewOf(state: MatchState, seat: number): BotView {
  const round = state.round;
  return {
    seat,
    hand: round.hands[seat].slice(),
    melds: round.melds,
    opened: round.opened[seat],
    settings: state.settings,
    topDiscard: round.discard[round.discard.length - 1] ?? null,
    phase: round.phase,
    source: round.source,
    nextMeldId: round.nextMeldId,
  };
}

interface Candidate {
  cards: Card[];
  points: number;
  penalty: number;
}

const MAX_JOKERS_PER_CANDIDATE = 2;
const SEARCH_BUDGET = 20000;

function keyOf(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

/** Lists card groups from the hand that form a legal new meld. */
function findCandidates(hand: readonly Card[], mustUse: Card | null): Candidate[] {
  const jokers = hand.filter(isJoker);
  const naturals = hand.filter((c) => !isJoker(c));
  // Prefer the required card when two copies of the same card are held.
  const ordered = mustUse ? [mustUse, ...naturals.filter((c) => c.id !== mustUse.id)] : naturals;
  const copies = new Map<string, Card[]>();
  for (const card of ordered) {
    const list = copies.get(keyOf(card)) ?? [];
    list.push(card);
    copies.set(keyOf(card), list);
  }
  const groups: Card[][] = [];

  // Sets: one card per suit, optionally completed by a joker.
  const ranks = new Set(naturals.map((c) => c.rank));
  for (const rank of ranks) {
    const bySuit = SUITS.map((suit) => copies.get(`${rank}-${suit}`)).filter((list): list is Card[] => !!list);
    const firsts = bySuit.map((list) => list[0]);
    for (let mask = 1; mask < 1 << firsts.length; mask++) {
      const picked = firsts.filter((_, i) => mask & (1 << i));
      if (picked.length >= 3) groups.push(picked);
      if (picked.length >= 2 && picked.length <= 3 && jokers.length >= 1) groups.push([...picked, jokers[0]]);
    }
    // A second copy of each suit can form a second set.
    const seconds = bySuit.map((list) => list[1]).filter((c): c is Card => !!c);
    if (seconds.length >= 3) groups.push(seconds);
  }

  // Runs: windows of consecutive positions, gaps filled by jokers.
  for (const suit of SUITS) {
    const at = new Map<number, Card>();
    for (const card of ordered) {
      if (card.suit !== suit) continue;
      const n = rankNumber(card.rank as Exclude<Card["rank"], "JOKER">);
      if (!at.has(n)) at.set(n, card);
      if (n === 1 && !at.has(14)) at.set(14, card);
    }
    if (at.size < 2) continue;
    for (let start = 1; start <= 12; start++) {
      for (let end = start + 2; end <= 14 && end - start + 1 <= 13; end++) {
        const picked: Card[] = [];
        let gaps = 0;
        for (let p = start; p <= end; p++) {
          const card = at.get(p);
          if (card && !picked.includes(card)) picked.push(card);
          else gaps += 1;
        }
        if (gaps > Math.min(jokers.length, MAX_JOKERS_PER_CANDIDATE) || picked.length < 2) continue;
        groups.push([...picked, ...jokers.slice(0, gaps)]);
      }
    }
  }

  const candidates: Candidate[] = [];
  for (const cards of groups) {
    const readings = interpretNewMeld(cards);
    if (readings.length === 0) continue;
    candidates.push({ cards, points: readings[0].points, penalty: cards.reduce((sum, c) => sum + penaltyValue(c), 0) });
  }
  return candidates;
}

interface Combination {
  melds: Candidate[];
  value: number;
}

/**
 * Finds the best set of disjoint candidate melds.
 * `naturalLimit` keeps at least one natural card in hand for the final discard.
 */
function bestCombination(
  candidates: Candidate[],
  valueOf: (c: Candidate) => number,
  naturalLimit: number,
  jokerLimit: number,
  mustUseId: string | null,
): Combination | null {
  let best: Combination | null = null;
  let budget = SEARCH_BUDGET;
  const used = new Set<string>();

  const visit = (from: number, chosen: Candidate[], value: number, naturalsUsed: number, jokersUsed: number, hasRequired: boolean): void => {
    if (budget-- <= 0) return;
    if (chosen.length > 0 && (mustUseId === null || hasRequired) && (!best || value > best.value)) {
      best = { melds: chosen.slice(), value };
    }
    for (let i = from; i < candidates.length; i++) {
      const candidate = candidates[i];
      // Two candidates may name the same joker. Jokers are interchangeable, so only natural ids and a joker count matter.
      const naturalIds = candidate.cards.filter((c) => !isJoker(c)).map((c) => c.id);
      if (naturalIds.some((id) => used.has(id))) continue;
      if (naturalsUsed + naturalIds.length > naturalLimit) continue;
      const jokersNeeded = candidate.cards.length - naturalIds.length;
      if (jokersUsed + jokersNeeded > jokerLimit) continue;
      naturalIds.forEach((id) => used.add(id));
      chosen.push(candidate);
      visit(i + 1, chosen, value + valueOf(candidate), naturalsUsed + naturalIds.length, jokersUsed + jokersNeeded, hasRequired || (mustUseId !== null && naturalIds.includes(mustUseId)));
      chosen.pop();
      naturalIds.forEach((id) => used.delete(id));
    }
  };
  visit(0, [], 0, 0, 0, false);
  return best;
}

/** Re-deals distinct joker cards to the chosen melds. Returns null when there are not enough jokers. */
function materialise(combination: Combination, hand: readonly Card[]): Card[][] | null {
  const jokers = hand.filter(isJoker);
  const groups: Card[][] = [];
  for (const meld of combination.melds) {
    const naturals = meld.cards.filter((c) => !isJoker(c));
    const needed = meld.cards.length - naturals.length;
    if (needed > jokers.length) return null;
    groups.push([...naturals, ...jokers.splice(0, needed)]);
  }
  return groups;
}

function findAddition(card: Card, melds: readonly TableMeld[]): TableMeld | null {
  for (const meld of melds) {
    if (interpretAddition(meld, [card]).length > 0) return meld;
  }
  return null;
}

interface PlanOptions {
  allowNewMelds: boolean;
  mode: PlayMode;
  mustUse: Card | null;
}

/** Builds a list of plays for this moment, or null when nothing useful and legal exists. */
function planPlays(view: BotView, hand: Card[], options: PlanOptions): Play[] | null {
  const needsOpening = !view.opened && view.settings.openingRequired;
  const valueOf = (c: Candidate) => (view.opened ? c.penalty : c.points);
  const attempts: (Play[] | null)[] = [];

  const build = (requiredInMeld: boolean): Play[] | null => {
    const plays: Play[] = [];
    let remaining = hand.slice();
    let melds = view.melds.slice();

    if (options.allowNewMelds) {
      const pool = findCandidates(remaining, requiredInMeld ? options.mustUse : null);
      const limit = remaining.filter((c) => !isJoker(c)).length - 1;
      const combination = bestCombination(pool, valueOf, limit, remaining.filter(isJoker).length, requiredInMeld && options.mustUse ? options.mustUse.id : null);
      const groups = combination ? materialise(combination, remaining) : null;
      if (groups) {
        for (const group of groups) {
          plays.push({ kind: "new-meld", cardIds: group.map((c) => c.id) });
          remaining = remaining.filter((c) => !group.includes(c));
        }
      } else if (requiredInMeld && options.mustUse) {
        return null;
      }
    }

    // Swap a held natural card for a table joker while the hand is large enough to reuse the joker.
    if ((view.opened || options.mode === "take-discard") && remaining.length >= 4) {
      for (const meld of melds) {
        for (const slot of meld.cards) {
          if (!isJoker(slot.card) || !slot.represents) continue;
          if (plays.some((p) => p.kind === "replace-joker" && p.jokerId === slot.card.id)) continue;
          const match = remaining.find((c) => canReplaceJoker(meld, slot.card.id, c));
          if (!match) continue;
          plays.push({ kind: "replace-joker", meldId: meld.id, jokerId: slot.card.id, cardId: match.id });
          remaining = [...remaining.filter((c) => c.id !== match.id), slot.card];
          melds = melds.map((m) => (m.id === meld.id ? { ...m, cards: m.cards.map((c) => (c.card.id === slot.card.id ? { card: match, represents: null } : c)) } : m));
        }
      }
    }

    // Add single cards to table melds, always keeping one natural card to discard.
    let progress = true;
    while (progress) {
      progress = false;
      const naturalsLeft = remaining.filter((c) => !isJoker(c)).length;
      for (const card of remaining) {
        if (isJoker(card) || naturalsLeft <= 1) continue;
        const target = findAddition(card, melds);
        if (!target) continue;
        const reading = interpretAddition(target, [card])[0];
        plays.push({ kind: "add", meldId: target.id, cardIds: [card.id] });
        melds = melds.map((m) => (m.id === target.id ? { ...m, cards: reading.cards, runStart: reading.runStart } : m));
        remaining = remaining.filter((c) => c.id !== card.id);
        progress = true;
        break;
      }
    }
    // Jokers may join table melds only in the turn that goes out. Try it when that leaves exactly one card.
    const jokersLeft = remaining.filter(isJoker);
    const naturalsHeld = remaining.length - jokersLeft.length;
    if (view.opened || options.mode === "take-discard") {
      const toPlace = naturalsHeld === 1 ? jokersLeft : naturalsHeld === 0 ? jokersLeft.slice(1) : [];
      if (toPlace.length > 0) {
        const extra: Play[] = [];
        let trial = melds;
        for (const joker of toPlace) {
          const target = findAddition(joker, trial);
          if (!target) break;
          const reading = interpretAddition(target, [joker])[0];
          extra.push({ kind: "add", meldId: target.id, cardIds: [joker.id] });
          trial = trial.map((m) => (m.id === target.id ? { ...m, cards: reading.cards, runStart: reading.runStart } : m));
        }
        if (extra.length === toPlace.length) plays.push(...extra);
      }
    }
    return plays.length > 0 ? plays : null;
  };

  // A taken discard only counts when it goes into a new meld, so that is the only plan worth trying.
  attempts.push(build(options.mustUse !== null));

  let bestPlays: Play[] | null = null;
  let bestScore = -1;
  for (const plays of attempts) {
    if (!plays) continue;
    const result = validatePlays(
      {
        seat: view.seat,
        hand,
        melds: view.melds,
        opened: view.opened,
        settings: view.settings,
        mode: options.mode,
        requiredCardId: options.mustUse ? options.mustUse.id : null,
        nextMeldId: view.nextMeldId,
      },
      plays,
    );
    if (!result.ok) continue;
    const score = needsOpening ? result.openingPoints : hand.length - result.hand.length + 1;
    if (score > bestScore) {
      bestScore = score;
      bestPlays = plays;
    }
  }
  return bestPlays;
}

/** How much a card is worth keeping. Low values are discarded first. */
function keepValue(card: Card, hand: readonly Card[], melds: readonly TableMeld[], opened: boolean): number {
  let value = 0;
  const n = rankNumber(card.rank as Exclude<Card["rank"], "JOKER">);
  for (const other of hand) {
    if (other.id === card.id || isJoker(other)) continue;
    if (other.rank === card.rank && other.suit !== card.suit) value += 2;
    if (other.suit === card.suit && other.rank !== card.rank) {
      const m = rankNumber(other.rank as Exclude<Card["rank"], "JOKER">);
      const gaps = [Math.abs(n - m)];
      if (n === 1) gaps.push(Math.abs(14 - m));
      if (m === 1) gaps.push(Math.abs(n - 14));
      const gap = Math.min(...gaps);
      if (gap === 1) value += 2;
      else if (gap === 2) value += 1;
    }
  }
  if (!opened && findAddition(card, melds)) value += 1;
  return value;
}

function chooseDiscard(view: BotView): GameAction {
  // Cards that fit a meld on the table may not be thrown away, so only the legal ones are weighed.
  const naturals = legalDiscards(view.hand, view.melds);
  if (naturals.length === 0) return { type: "PASS_TURN" };
  let best = naturals[0];
  let bestKeep = Infinity;
  for (const card of naturals) {
    const keep = keepValue(card, view.hand, view.melds, view.opened);
    if (keep < bestKeep || (keep === bestKeep && penaltyValue(card) > penaltyValue(best))) {
      best = card;
      bestKeep = keep;
    }
  }
  return { type: "DISCARD_CARD", cardId: best.id };
}

/** Picks the next single action for a bot. Deterministic for a given view. */
export function chooseBotAction(view: BotView): GameAction {
  if (view.phase === "draw") {
    if (view.topDiscard) {
      const plays = planPlays(view, [...view.hand, view.topDiscard], { allowNewMelds: true, mode: "take-discard", mustUse: view.topDiscard });
      if (plays) return { type: "TAKE_DISCARD_AND_PLAY", plays };
    }
    return { type: "DRAW_FROM_STOCK" };
  }
  if (view.opened) {
    // An opened player may place new melds in any turn, whichever pile the card came from.
    const plays = planPlays(view, view.hand, {
      allowNewMelds: true,
      mode: view.source === "discard" ? "after-discard" : "after-stock",
      mustUse: null,
    });
    if (plays) return { type: "PLAY", plays };
  }
  return chooseDiscard(view);
}

/** A move that is always legal. Used when a planned bot action is unexpectedly rejected. */
export function fallbackBotAction(view: BotView): GameAction {
  if (view.phase === "draw") return { type: "DRAW_FROM_STOCK" };
  return chooseDiscard(view);
}
