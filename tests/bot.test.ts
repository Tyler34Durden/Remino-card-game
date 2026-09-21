import { describe, expect, it } from "vitest";
import type { RoomSettings } from "../shared/types.ts";
import { DEFAULT_SETTINGS } from "../shared/types.ts";
import { botViewOf, chooseBotAction } from "../engine/bot.ts";
import { isJoker } from "../engine/cards.ts";
import { applyAction, createMatch, startNextRound } from "../engine/game.ts";
import type { MatchState } from "../engine/game.ts";
import { card, cards, expectOk, scenario, tableMeld } from "./helpers.ts";

function checkInvariants(state: MatchState): void {
  const round = state.round;
  const all = [...round.stock, ...round.discard, ...round.hands.flat(), ...round.melds.flatMap((m) => m.cards.map((c) => c.card))];
  const expected = 104 + state.settings.jokerCount;
  expect(all).toHaveLength(expected);
  expect(new Set(all.map((c) => c.id)).size).toBe(expected);
  // A joker may only ever be discarded as a final card, so it can sit on top of the pile only once the round is over.
  expect(round.discard.slice(0, -1).some(isJoker)).toBe(false);
  if (state.status === "playing") expect(round.discard.some(isJoker)).toBe(false);
  for (const meld of round.melds) {
    expect(meld.cards.length).toBeGreaterThanOrEqual(3);
    for (const slot of meld.cards) expect(isJoker(slot.card)).toBe(slot.represents !== null);
  }
}

export interface MatchSummary {
  rounds: number;
  steps: number;
  blockedRounds: number;
  rejected: number;
}

/** Plays a whole match with bots in every seat and checks the state after every action. */
export function playBotMatch(settings: RoomSettings, seed: number, maxSteps = 60000): { state: MatchState; summary: MatchSummary } {
  let state = createMatch(settings, seed);
  const summary: MatchSummary = { rounds: 0, steps: 0, blockedRounds: 0, rejected: 0 };
  while (state.status !== "match-end" && summary.steps < maxSteps) {
    if (state.status === "round-end") {
      summary.rounds += 1;
      if (state.lastResult?.blocked) summary.blockedRounds += 1;
      state = expectOk(startNextRound(state)).state;
      continue;
    }
    const seat = state.round.activeSeat;
    const action = chooseBotAction(botViewOf(state, seat));
    const result = applyAction(state, seat, action);
    if (!result.ok) {
      summary.rejected += 1;
      throw new Error(`Bot action rejected: ${result.error} (${JSON.stringify(action)})`);
    }
    state = result.state;
    summary.steps += 1;
    if (summary.steps % 25 === 0) checkInvariants(state);
  }
  checkInvariants(state);
  return { state, summary };
}

describe("bot decisions", () => {
  it("takes the discard only when it can use it", () => {
    const usable = scenario({ hands: [cards("4C 5C KH 9D")], discard: [card("3C", 1)], opened: [true, false, false, false] });
    expect(chooseBotAction(botViewOf(usable, 0)).type).toBe("TAKE_DISCARD_AND_PLAY");
    const useless = scenario({ hands: [cards("4C 9S KH 9D")], discard: [card("3C", 1)], opened: [true, false, false, false] });
    expect(chooseBotAction(botViewOf(useless, 0)).type).toBe("DRAW_FROM_STOCK");
  });

  it("does not take a discard that would only fit as an addition", () => {
    const state = scenario({
      hands: [cards("KH 9S 2C 4D")],
      discard: [card("8D", 1)],
      opened: [true, false, false, false],
      melds: [tableMeld("m1", 1, cards("5D 6D 7D"))],
    });
    expect(chooseBotAction(botViewOf(state, 0)).type).toBe("DRAW_FROM_STOCK");
  });

  it("does not take the discard when it cannot reach the opening threshold", () => {
    const state = scenario({ hands: [cards("4C 5C KH 9D")], discard: [card("3C", 1)] });
    expect(chooseBotAction(botViewOf(state, 0)).type).toBe("DRAW_FROM_STOCK");
  });

  it("opens when the discard completes enough points", () => {
    const state = scenario({ hands: [cards("JC QC 10H 10S 10C 8D 9D 10D 2S")], discard: [card("KC", 1)] });
    const action = chooseBotAction(botViewOf(state, 0));
    expect(action.type).toBe("TAKE_DISCARD_AND_PLAY");
    expect(expectOk(applyAction(state, 0, action)).state.round.opened[0]).toBe(true);
  });

  it("adds to table melds after a stock draw and then discards", () => {
    const state = scenario({
      hands: [cards("8D KH 2C")],
      opened: [true, false, false, false],
      melds: [tableMeld("m1", 1, cards("5D 6D 7D"))],
    });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    const action = chooseBotAction(botViewOf(drawn, 0));
    expect(action).toEqual({ type: "PLAY", plays: [{ kind: "add", meldId: "m1", cardIds: [card("8D").id] }] });
    const after = expectOk(applyAction(drawn, 0, action)).state;
    expect(chooseBotAction(botViewOf(after, 0)).type).toBe("DISCARD_CARD");
  });

  it("places a new meld from its hand after a stock draw once it has opened", () => {
    const state = scenario({ hands: [cards("10S JS QS KH 2C")], opened: [true, false, false, false] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    const action = chooseBotAction(botViewOf(drawn, 0));
    expect(action.type).toBe("PLAY");
    const after = expectOk(applyAction(drawn, 0, action)).state;
    expect(after.round.melds).toHaveLength(1);
  });

  it("never discards a card that fits a meld on the table", () => {
    const state = scenario({ hands: [cards("8D 4D 2C")], melds: [tableMeld("m1", 1, cards("5D 6D 7D"))] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    const action = chooseBotAction(botViewOf(drawn, 0));
    expect(action.type).toBe("DISCARD_CARD");
    if (action.type === "DISCARD_CARD") expect([card("8D").id, card("4D").id]).not.toContain(action.cardId);
    expectOk(applyAction(drawn, 0, action));
  });

  it("never tries to discard a joker", () => {
    const state = scenario({ hands: [[{ id: "joker-0", deckIndex: 0, suit: null, rank: "JOKER" }, card("KH")]] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    const action = chooseBotAction(botViewOf(drawn, 0));
    expect(action.type).toBe("DISCARD_CARD");
    if (action.type === "DISCARD_CARD") expect(action.cardId).not.toBe("joker-0");
  });
});

describe("unattended bot matches", () => {
  const variants: { name: string; settings: RoomSettings }[] = [
    { name: "default four seats", settings: DEFAULT_SETTINGS },
    { name: "five seats without jokers", settings: { ...DEFAULT_SETTINGS, seatCount: 5, jokerCount: 0 } },
    { name: "four seats with eight jokers", settings: { ...DEFAULT_SETTINGS, jokerCount: 8 } },
    { name: "six seats with one joker", settings: { ...DEFAULT_SETTINGS, seatCount: 6, jokerCount: 1 } },
    { name: "six seats, opening disabled", settings: { ...DEFAULT_SETTINGS, seatCount: 6, openingRequired: false } },
    { name: "fixed rounds", settings: { ...DEFAULT_SETTINGS, matchFormat: "fixed-rounds", roundCount: 3 } },
  ];

  for (const variant of variants) {
    it(`finishes legal matches: ${variant.name}`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const { state, summary } = playBotMatch(variant.settings, seed);
        expect(summary.rejected).toBe(0);
        expect(state.status).toBe("match-end");
        expect(state.matchWinnerSeat).not.toBeNull();
        const lowest = Math.min(...state.scores);
        expect(state.scores[state.matchWinnerSeat as number]).toBe(lowest);
        expect(state.scores.filter((s) => s === lowest)).toHaveLength(1);
      }
    }, 120000);
  }
});
