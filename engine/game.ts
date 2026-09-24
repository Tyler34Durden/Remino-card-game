import type { Card, CardSource, GameAction, Play, RoomSettings, RoundResult, TableMeld, TurnPhase } from "../shared/types.ts";
import { MAX_JOKERS } from "../shared/types.ts";
import { HAND_SIZE, buildDeck, cardLabel, handPenalty, isJoker, nextRandom, shuffle } from "./cards.ts";
import { legalDiscards } from "./melds.ts";
import { validatePlays } from "./plays.ts";
import type { PlayMode } from "./plays.ts";

export interface RoundState {
  roundNumber: number;
  dealerSeat: number;
  activeSeat: number;
  phase: TurnPhase;
  source: CardSource | null;
  /** The top of the stock is the last element. */
  stock: Card[];
  /** The top of the discard pile is the last element. */
  discard: Card[];
  melds: TableMeld[];
  hands: Card[][];
  opened: boolean[];
  drawnCardId: string | null;
  nextMeldId: number;
  turnCount: number;
}

export type MatchStatus = "playing" | "round-end" | "match-end";

export interface MatchState {
  settings: RoomSettings;
  seatCount: number;
  scores: number[];
  /** Consecutive rounds won by each seat; cosmetic, never affects play or scoring. */
  roundWinStreaks: number[];
  status: MatchStatus;
  round: RoundState;
  roundsCompleted: number;
  tiebreak: boolean;
  matchWinnerSeat: number | null;
  lastResult: RoundResult | null;
  rngState: number;
  version: number;
}

/** Log lines name seats as {0}, {1} and so on. The room swaps in player names. */
export type ActionResult = { ok: true; state: MatchState; log: string[] } | { ok: false; error: string };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function validateSettings(settings: RoomSettings): string | null {
  if (![4, 5, 6].includes(settings.seatCount)) return "Table size must be 4, 5, or 6.";
  if (!Number.isInteger(settings.openingThreshold) || settings.openingThreshold < 1 || settings.openingThreshold > 300) {
    return "Opening threshold must be a whole number from 1 to 300.";
  }
  if (!Number.isInteger(settings.scoreLimit) || settings.scoreLimit < 10 || settings.scoreLimit > 2000) {
    return "Score limit must be a whole number from 10 to 2000.";
  }
  if (!Number.isInteger(settings.roundCount) || settings.roundCount < 1 || settings.roundCount > 50) {
    return "Number of rounds must be a whole number from 1 to 50.";
  }
  if (settings.matchFormat !== "score-limit" && settings.matchFormat !== "fixed-rounds") return "Unknown match format.";
  if (!Number.isInteger(settings.jokerCount) || settings.jokerCount < 0 || settings.jokerCount > MAX_JOKERS) {
    return `The number of jokers must be a whole number from 0 to ${MAX_JOKERS}.`;
  }
  if (typeof settings.openingRequired !== "boolean") return "Invalid settings.";
  return null;
}

function dealRound(settings: RoomSettings, seatCount: number, roundNumber: number, dealerSeat: number, rngState: number) {
  const shuffled = shuffle(buildDeck(settings.jokerCount), rngState);
  const stock = shuffled.items;
  const hands: Card[][] = Array.from({ length: seatCount }, () => []);
  for (let i = 0; i < HAND_SIZE; i++) {
    for (let seat = 0; seat < seatCount; seat++) {
      const seatIndex = (dealerSeat + 1 + seat) % seatCount;
      hands[seatIndex].push(stock.pop() as Card);
    }
  }
  // Start the discard pile with the first non-joker card from the top of the stock.
  let starterIndex = stock.length - 1;
  while (starterIndex >= 0 && isJoker(stock[starterIndex])) starterIndex -= 1;
  const starter = stock.splice(starterIndex, 1)[0];
  const round: RoundState = {
    roundNumber,
    dealerSeat,
    activeSeat: (dealerSeat + 1) % seatCount,
    phase: "draw",
    source: null,
    stock,
    discard: [starter],
    melds: [],
    hands,
    opened: Array.from({ length: seatCount }, () => false),
    drawnCardId: null,
    nextMeldId: 1,
    turnCount: 0,
  };
  return { round, rngState: shuffled.rngState };
}

/** Creates a match and deals the first round. The same seed always gives the same match. */
export function createMatch(settings: RoomSettings, seed: number): MatchState {
  const problem = validateSettings(settings);
  if (problem) throw new Error(problem);
  const seatCount = settings.seatCount;
  const first = nextRandom(seed | 0);
  const dealerSeat = Math.floor(first.value * seatCount);
  const dealt = dealRound(settings, seatCount, 1, dealerSeat, first.state);
  return {
    settings: { ...settings },
    seatCount,
    scores: Array.from({ length: seatCount }, () => 0),
    roundWinStreaks: Array.from({ length: seatCount }, () => 0),
    status: "playing",
    round: dealt.round,
    roundsCompleted: 0,
    tiebreak: false,
    matchWinnerSeat: null,
    lastResult: null,
    rngState: dealt.rngState,
    version: 1,
  };
}

/** The seat holding the uniquely lowest score, or null when the lowest score is tied. */
export function uniqueLowestSeat(scores: readonly number[]): number | null {
  const lowest = Math.min(...scores);
  const seats = scores.map((score, seat) => ({ score, seat })).filter((entry) => entry.score === lowest);
  return seats.length === 1 ? seats[0].seat : null;
}

/** Moves all but the top discard into a freshly shuffled stock when the stock is empty. */
function rebuildStockIfEmpty(state: MatchState): void {
  const round = state.round;
  if (round.stock.length > 0 || round.discard.length <= 1) return;
  const top = round.discard.pop() as Card;
  const shuffled = shuffle(round.discard, state.rngState);
  round.stock = shuffled.items;
  state.rngState = shuffled.rngState;
  round.discard = [top];
}

function finishRound(state: MatchState, winnerSeat: number | null, log: string[]): void {
  const round = state.round;
  const penalties = round.hands.map((hand, seat) => (seat === winnerSeat ? 0 : handPenalty(hand)));
  penalties.forEach((penalty, seat) => {
    state.scores[seat] += penalty;
    state.roundWinStreaks[seat] = seat === winnerSeat ? state.roundWinStreaks[seat] + 1 : 0;
  });
  state.roundsCompleted += 1;
  state.lastResult = {
    roundNumber: round.roundNumber,
    winnerSeat,
    blocked: winnerSeat === null,
    hands: round.hands.map((hand) => hand.slice()),
    penalties,
  };
  const limitReached =
    state.settings.matchFormat === "score-limit"
      ? state.scores.some((score) => score >= state.settings.scoreLimit)
      : state.roundsCompleted >= state.settings.roundCount;
  if (limitReached) {
    const leader = uniqueLowestSeat(state.scores);
    if (leader !== null) {
      state.status = "match-end";
      state.matchWinnerSeat = leader;
      log.push(`{${leader}} wins the match.`);
      return;
    }
    state.tiebreak = true;
    log.push("The lowest score is tied, so a tiebreak round will be played.");
  }
  state.status = "round-end";
}

function advanceTurn(state: MatchState): void {
  const round = state.round;
  round.activeSeat = (round.activeSeat + 1) % state.seatCount;
  round.phase = "draw";
  round.source = null;
  round.drawnCardId = null;
  round.turnCount += 1;
}

function describePlays(descriptions: string[]): string {
  return descriptions.join(", ");
}

/**
 * Applies one player action. The input state is never mutated.
 * Every rejected action comes back with a message the player can read.
 */
export function applyAction(current: MatchState, seat: number, action: GameAction): ActionResult {
  if (current.status !== "playing") return fail("No round is in progress.");
  if (!Number.isInteger(seat) || seat < 0 || seat >= current.seatCount) return fail("Unknown seat.");
  if (current.round.activeSeat !== seat) return fail("It is not your turn.");

  const state = clone(current);
  const round = state.round;
  const hand = round.hands[seat];
  const log: string[] = [];

  switch (action.type) {
    case "DRAW_FROM_STOCK": {
      if (round.phase !== "draw") return fail("You have already taken a card this turn.");
      rebuildStockIfEmpty(state);
      if (round.stock.length === 0) {
        log.push("The stock ran out and cannot be rebuilt. The round ends with no winner.");
        finishRound(state, null, log);
        break;
      }
      const card = round.stock.pop() as Card;
      hand.push(card);
      round.phase = "play";
      round.source = "stock";
      round.drawnCardId = card.id;
      rebuildStockIfEmpty(state);
      log.push(`{${seat}} drew from the stock.`);
      break;
    }

    case "TAKE_DISCARD_AND_PLAY": {
      if (round.phase !== "draw") return fail("You have already taken a card this turn.");
      const top = round.discard[round.discard.length - 1];
      if (!top) return fail("The discard pile is empty.");
      if (!Array.isArray(action.plays)) return fail("Choose at least one table play.");
      const wasOpened = round.opened[seat];
      const result = validatePlays(
        {
          seat,
          hand: [...hand, top],
          melds: round.melds,
          opened: wasOpened,
          settings: state.settings,
          mode: "take-discard",
          requiredCardId: top.id,
          nextMeldId: round.nextMeldId,
        },
        action.plays,
      );
      if (!result.ok) return fail(result.error);
      round.discard.pop();
      round.hands[seat] = result.hand;
      round.melds = result.melds;
      round.nextMeldId = result.nextMeldId;
      round.opened[seat] = true;
      round.phase = "play";
      round.source = "discard";
      round.drawnCardId = null;
      const opening = wasOpened ? "" : state.settings.openingRequired ? ` and opened with ${result.openingPoints} points` : " and opened";
      log.push(`{${seat}} took ${cardLabel(top)} from the discard pile${opening}: ${describePlays(result.descriptions)}.`);
      break;
    }

    case "PLAY": {
      if (round.phase !== "play" || round.source === null) return fail("Take a card before making table plays.");
      if (!Array.isArray(action.plays)) return fail("Choose at least one table play.");
      const mode: PlayMode = round.source === "stock" ? "after-stock" : "after-discard";
      const result = validatePlays(
        {
          seat,
          hand,
          melds: round.melds,
          opened: round.opened[seat],
          settings: state.settings,
          mode,
          requiredCardId: null,
          nextMeldId: round.nextMeldId,
        },
        action.plays,
      );
      if (!result.ok) return fail(result.error);
      round.hands[seat] = result.hand;
      round.melds = result.melds;
      round.nextMeldId = result.nextMeldId;
      log.push(`{${seat}} played ${describePlays(result.descriptions)}.`);
      break;
    }

    case "DISCARD_CARD": {
      if (round.phase !== "play") return fail("Take a card before discarding.");
      const index = hand.findIndex((c) => c.id === action.cardId);
      if (index === -1) return fail("That card is not in your hand.");
      const card = hand[index];
      if (isJoker(card) && hand.length > 1) return fail("A joker can be discarded only as your very last card.");
      if (!legalDiscards(hand, round.melds).some((c) => c.id === card.id)) {
        return fail(`You cannot discard ${cardLabel(card)} because it fits a meld on the table. Discard a card that does not fit.`);
      }
      hand.splice(index, 1);
      round.discard.push(card);
      log.push(`{${seat}} discarded ${cardLabel(card)}.`);
      if (hand.length === 0) {
        log.push(`{${seat}} went out and wins round ${round.roundNumber}.`);
        finishRound(state, seat, log);
      } else {
        advanceTurn(state);
      }
      break;
    }

    case "PASS_TURN": {
      if (round.phase !== "play") return fail("Take a card before ending your turn.");
      if (hand.length === 1 || hand.some((c) => !isJoker(c))) return fail("You must discard a card to end your turn.");
      log.push(`{${seat}} holds only jokers and passes without discarding.`);
      advanceTurn(state);
      break;
    }

    default:
      return fail("Unknown action.");
  }

  state.version += 1;
  return { ok: true, state, log };
}

/** Convenience wrapper for a single table play. */
export function applyPlay(state: MatchState, seat: number, play: Play): ActionResult {
  return applyAction(state, seat, { type: "PLAY", plays: [play] });
}

/** Deals the next round. The dealer moves one seat clockwise. */
export function startNextRound(current: MatchState): ActionResult {
  if (current.status !== "round-end") return fail("The next round cannot start now.");
  const state = clone(current);
  const dealerSeat = (state.round.dealerSeat + 1) % state.seatCount;
  const dealt = dealRound(state.settings, state.seatCount, state.round.roundNumber + 1, dealerSeat, state.rngState);
  state.round = dealt.round;
  state.rngState = dealt.rngState;
  state.status = "playing";
  state.version += 1;
  const label = state.tiebreak ? "Tiebreak round" : "Round";
  return { ok: true, state, log: [`${label} ${state.round.roundNumber} begins. {${dealerSeat}} deals.`] };
}

/** A voluntary early ending. Only legal between rounds with one uniquely lowest score. */
export function endMatchEarly(current: MatchState): ActionResult {
  if (current.status !== "round-end") return fail("A match can only be ended between rounds.");
  const leader = uniqueLowestSeat(current.scores);
  if (leader === null) return fail("The lowest score is tied, so the match cannot end yet.");
  const state = clone(current);
  state.status = "match-end";
  state.matchWinnerSeat = leader;
  state.version += 1;
  return { ok: true, state, log: [`The host ended the match. {${leader}} wins.`] };
}

/** A late joiner takes over a seat with the current highest cumulative score. */
export function applyLateJoin(current: MatchState, seat: number): MatchState {
  const state = clone(current);
  state.scores[seat] = Math.max(...state.scores);
  state.roundWinStreaks[seat] = 0;
  state.version += 1;
  return state;
}
