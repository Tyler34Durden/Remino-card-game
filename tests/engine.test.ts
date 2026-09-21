import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/types.ts";
import { HAND_SIZE, buildDeck, handPenalty, isJoker } from "../engine/cards.ts";
import { applyAction, applyLateJoin, createMatch, endMatchEarly, startNextRound, uniqueLowestSeat, validateSettings } from "../engine/game.ts";
import { canReplaceJoker, interpretAddition, interpretNewMeld } from "../engine/melds.ts";
import { card, cards, expectError, expectOk, joker, scenario, tableMeld } from "./helpers.ts";

describe("decks and dealing", () => {
  it("always builds two decks, plus exactly the chosen number of jokers", () => {
    expect(buildDeck(0)).toHaveLength(104);
    expect(buildDeck(0).filter(isJoker)).toHaveLength(0);
    for (const count of [1, 3, 4, 8]) {
      expect(buildDeck(count)).toHaveLength(104 + count);
      expect(buildDeck(count).filter(isJoker)).toHaveLength(count);
    }
    const withJokers = buildDeck(4);
    expect(withJokers.filter((c) => c.rank === "7" && c.suit === "hearts")).toHaveLength(2);
  });

  it("gives every physical card a unique id", () => {
    const deck = buildDeck(8);
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);
  });

  it.each([4, 5, 6] as const)("deals fourteen cards to each of %i seats", (seatCount) => {
    const state = createMatch({ ...DEFAULT_SETTINGS, seatCount }, 42);
    expect(state.round.hands).toHaveLength(seatCount);
    expect(HAND_SIZE).toBe(14);
    for (const hand of state.round.hands) expect(hand).toHaveLength(14);
    expect(state.round.discard).toHaveLength(1);
    expect(state.round.stock.length).toBe(108 - seatCount * 14 - 1);
    expect(state.round.activeSeat).toBe((state.round.dealerSeat + 1) % seatCount);
  });

  it("deals the chosen number of jokers into the round and rejects counts out of range", () => {
    for (const jokerCount of [0, 1, 5, 8]) {
      const state = createMatch({ ...DEFAULT_SETTINGS, jokerCount }, 3);
      const all = [...state.round.stock, ...state.round.discard, ...state.round.hands.flat()];
      expect(all).toHaveLength(104 + jokerCount);
      expect(all.filter(isJoker)).toHaveLength(jokerCount);
    }
    expect(validateSettings({ ...DEFAULT_SETTINGS, jokerCount: 9 })).toMatch(/0 to 8/);
    expect(validateSettings({ ...DEFAULT_SETTINGS, jokerCount: -1 })).toMatch(/0 to 8/);
    expect(validateSettings({ ...DEFAULT_SETTINGS, jokerCount: 2.5 })).toMatch(/0 to 8/);
  });

  it("never starts the discard pile with a joker", () => {
    for (let seed = 0; seed < 300; seed++) {
      const state = createMatch({ ...DEFAULT_SETTINGS, jokerCount: 8 }, seed);
      expect(isJoker(state.round.discard[0])).toBe(false);
    }
  });

  it("is deterministic for a given seed", () => {
    expect(createMatch(DEFAULT_SETTINGS, 5)).toEqual(createMatch(DEFAULT_SETTINGS, 5));
    expect(createMatch(DEFAULT_SETTINGS, 5).round.hands).not.toEqual(createMatch(DEFAULT_SETTINGS, 6).round.hands);
  });
});

describe("melds", () => {
  it("accepts valid sets and runs", () => {
    expect(interpretNewMeld(cards("2H 2C 2S"))[0].type).toBe("set");
    expect(interpretNewMeld(cards("5D 6D 7D 8D"))[0].type).toBe("run");
    expect(interpretNewMeld(cards("9H 9C 9S 9D"))[0].points).toBe(36);
  });

  it("rejects identical rank-and-suit cards in one set", () => {
    expect(interpretNewMeld([card("2H"), card("2H", 1), card("2C")])).toHaveLength(0);
  });

  it("rejects groups that are too short or mixed", () => {
    expect(interpretNewMeld(cards("2H 2C"))).toHaveLength(0);
    expect(interpretNewMeld(cards("2H 3C 4S"))).toHaveLength(0);
    expect(interpretNewMeld(cards("2H 3H 5H"))).toHaveLength(0);
  });

  it("accepts A-2-3 with the ace worth 1", () => {
    const reading = interpretNewMeld(cards("AH 2H 3H"))[0];
    expect(reading.runStart).toBe(1);
    expect(reading.points).toBe(6);
  });

  it("accepts Q-K-A with the ace worth 10", () => {
    const reading = interpretNewMeld(cards("QC KC AC"))[0];
    expect(reading.runStart).toBe(12);
    expect(reading.points).toBe(30);
  });

  it("rejects K-A-2", () => {
    expect(interpretNewMeld(cards("KD AD 2D"))).toHaveLength(0);
  });

  it("values an ace in a set at 10", () => {
    expect(interpretNewMeld(cards("AH AC AS"))[0].points).toBe(30);
  });

  it("extends runs at either end and completes sets", () => {
    const run = tableMeld("m1", 0, cards("5D 6D 7D"));
    expect(interpretAddition(run, cards("8D"))[0].cards).toHaveLength(4);
    expect(interpretAddition(run, cards("4D"))[0].runStart).toBe(4);
    expect(interpretAddition(run, cards("9D"))).toHaveLength(0);
    const set = tableMeld("m2", 0, cards("KH KC KS"));
    expect(interpretAddition(set, cards("KD"))).toHaveLength(1);
    expect(interpretAddition(set, [card("KH", 1)])).toHaveLength(0);
  });
});

describe("jokers in melds", () => {
  it("substitutes for a missing card and records what it represents", () => {
    const reading = interpretNewMeld([card("5H"), joker(0), card("7H")])[0];
    expect(reading.type).toBe("run");
    expect(reading.cards[1].represents).toEqual({ rank: "6", suit: "hearts" });
    expect(reading.points).toBe(18);
  });

  it("offers every reading of an ambiguous joker and honours an explicit choice", () => {
    const group = [card("5H"), card("6H"), joker(0)];
    const readings = interpretNewMeld(group);
    expect(readings.map((r) => r.runStart).sort()).toEqual([4, 5]);
    expect(readings[0].points).toBe(18);
    const low = interpretNewMeld(group, { [joker(0).id]: { rank: "4", suit: "hearts" } });
    expect(low).toHaveLength(1);
    expect(low[0].runStart).toBe(4);
    expect(interpretNewMeld(group, { [joker(0).id]: { rank: "9", suit: "hearts" } })).toHaveLength(0);
  });

  it("lets a joker in a set stand for any missing suit", () => {
    const readings = interpretNewMeld([card("AS"), card("AH"), joker(0)]);
    expect(readings).toHaveLength(1);
    const slot = readings[0].cards.find((c) => isJoker(c.card));
    expect(slot?.represents).toEqual({ rank: "A", suit: null });
    expect(readings[0].points).toBe(30);
    const meld = tableMeld("m1", 1, [card("AS"), card("AH"), joker(0)]);
    expect(canReplaceJoker(meld, joker(0).id, card("AD"))).toBe(true);
    expect(canReplaceJoker(meld, joker(0).id, card("AC"))).toBe(true);
    expect(canReplaceJoker(meld, joker(0).id, card("AS", 1))).toBe(false);
    expect(canReplaceJoker(meld, joker(0).id, card("KD"))).toBe(false);
    expect(canReplaceJoker(meld, joker(0).id, joker(1))).toBe(false);
  });

  it("keeps a set with a joker at four cards", () => {
    const meld = tableMeld("m1", 1, [card("AS"), card("AH"), joker(0)]);
    const four = interpretAddition(meld, [card("AD")]);
    expect(four).toHaveLength(1);
    expect(interpretAddition(meld, [card("AS", 1)])).toHaveLength(0);
    expect(interpretAddition(meld, [card("AD"), card("AC")])).toHaveLength(0);
    const full = { ...meld, cards: four[0].cards };
    expect(interpretAddition(full, [card("AC")])).toHaveLength(0);
    expect(canReplaceJoker(full, joker(0).id, card("AC"))).toBe(true);
    expect(canReplaceJoker(full, joker(0).id, card("AD", 1))).toBe(false);
  });

  it("still fixes the exact card for a joker in a run", () => {
    const meld = tableMeld("m1", 1, [card("5H"), joker(0), card("7H")]);
    expect(canReplaceJoker(meld, joker(0).id, card("6H"))).toBe(true);
    expect(canReplaceJoker(meld, joker(0).id, card("6D"))).toBe(false);
  });

  it("needs at least two natural cards", () => {
    expect(interpretNewMeld([card("8H"), joker(0), joker(1)])).toHaveLength(0);
  });
});

describe("turn flow", () => {
  it("rejects out-of-turn and unknown-seat actions", () => {
    const state = scenario({ hands: [] });
    expect(expectError(applyAction(state, 1, { type: "DRAW_FROM_STOCK" }))).toMatch(/not your turn/i);
    expect(expectError(applyAction(state, 9, { type: "DRAW_FROM_STOCK" }))).toMatch(/seat/i);
  });

  it("does not let a player draw twice or draw from both sources", () => {
    const state = scenario({ hands: [cards("4C 5C KH 2D")], discard: [card("3C", 1)], opened: [true, false, false, false] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    expectError(applyAction(drawn, 0, { type: "DRAW_FROM_STOCK" }));
    const take = { type: "TAKE_DISCARD_AND_PLAY", plays: [{ kind: "new-meld", cardIds: [card("3C", 1).id, card("4C").id, card("5C").id] }] } as const;
    expect(expectError(applyAction(drawn, 0, take))).toMatch(/already taken/i);
    const took = expectOk(applyAction(state, 0, take)).state;
    expect(expectError(applyAction(took, 0, { type: "DRAW_FROM_STOCK" }))).toMatch(/already taken/i);
  });

  it("does not mutate the input state", () => {
    const state = scenario({ hands: [] });
    const before = structuredClone(state);
    applyAction(state, 0, { type: "DRAW_FROM_STOCK" });
    expect(state).toEqual(before);
  });

  it("lets an opened player place new melds and additions after a stock draw", () => {
    const state = scenario({
      hands: [cards("4C 5C 6C 8D KH")],
      opened: [true, false, false, false],
      melds: [tableMeld("m1", 1, cards("5D 6D 7D"))],
    });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    const melded = expectOk(applyAction(drawn, 0, { type: "PLAY", plays: [{ kind: "new-meld", cardIds: cards("4C 5C 6C").map((c) => c.id) }] })).state;
    expect(melded.round.melds).toHaveLength(2);
    expect(melded.round.melds[1].ownerSeat).toBe(0);
    const added = expectOk(applyAction(melded, 0, { type: "PLAY", plays: [{ kind: "add", meldId: "m1", cardIds: [card("8D").id] }] })).state;
    expect(added.round.melds[0].cards).toHaveLength(4);
    // Going out still needs a final discard.
    const out = expectOk(applyAction(added, 0, { type: "DISCARD_CARD", cardId: card("KH").id })).state;
    expect(out.round.hands[0]).toHaveLength(1);
  });

  it("does not let an unopened player place a new meld after a stock draw", () => {
    const state = scenario({ hands: [cards("10S JS QS KH 2C")] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    const play = { type: "PLAY", plays: [{ kind: "new-meld", cardIds: cards("10S JS QS").map((c) => c.id) }] } as const;
    expect(expectError(applyAction(drawn, 0, play))).toMatch(/not opened/i);
  });

  it("does not let an unopened player add to melds after a stock draw", () => {
    const state = scenario({ hands: [cards("8D KH 2C")], melds: [tableMeld("m1", 1, cards("5D 6D 7D"))] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    expect(expectError(applyAction(drawn, 0, { type: "PLAY", plays: [{ kind: "add", meldId: "m1", cardIds: [card("8D").id] }] }))).toMatch(/not opened/i);
  });

  it("requires the taken discard to be used in the same turn", () => {
    const state = scenario({
      hands: [cards("4C 5C 6C 9H 9S 9D KH")],
      discard: [card("3C", 1)],
      opened: [true, false, false, false],
    });
    const withoutIt = { type: "TAKE_DISCARD_AND_PLAY", plays: [{ kind: "new-meld", cardIds: cards("9H 9S 9D").map((c) => c.id) }] } as const;
    expect(expectError(applyAction(state, 0, withoutIt))).toMatch(/must go into a new meld/i);
    expect(expectError(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays: [] }))).toMatch(/at least one/i);
    // A rejected take leaves the pile untouched.
    expect(state.round.discard).toHaveLength(1);
    const withIt = { type: "TAKE_DISCARD_AND_PLAY", plays: [{ kind: "new-meld", cardIds: [card("3C", 1).id, card("4C").id, card("5C").id] }] } as const;
    const took = expectOk(applyAction(state, 0, withIt)).state;
    expect(took.round.discard).toHaveLength(0);
    // The taken card is on the table, so it can be neither kept nor discarded back.
    expect(took.round.hands[0].some((c) => c.id === card("3C", 1).id)).toBe(false);
    expect(expectError(applyAction(took, 0, { type: "DISCARD_CARD", cardId: card("3C", 1).id }))).toMatch(/not in your hand/i);
  });

  it("does not accept the taken discard as an addition to a table meld", () => {
    const state = scenario({
      hands: [cards("9H 9S KH 2D")],
      discard: [card("8D", 1)],
      opened: [true, false, false, false],
      melds: [tableMeld("m1", 1, cards("5D 6D 7D"))],
    });
    const add = { kind: "add", meldId: "m1", cardIds: [card("8D", 1).id] } as const;
    expect(expectError(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays: [add] }))).toMatch(/new meld/i);
    expect(state.round.discard).toHaveLength(1);
  });

  it("does not accept the taken discard as a joker replacement", () => {
    const state = scenario({
      hands: [cards("9H 9S KH 2D")],
      discard: [card("6H", 1)],
      opened: [true, false, false, false],
      melds: [tableMeld("m1", 1, [card("5H"), joker(0), card("7H")])],
    });
    const swap = { kind: "replace-joker", meldId: "m1", jokerId: joker(0).id, cardId: card("6H", 1).id } as const;
    expect(expectError(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays: [swap] }))).toMatch(/new meld/i);
  });

  it("accepts the taken discard in a new meld, with extra additions alongside", () => {
    const state = scenario({
      hands: [cards("9H 9S 8D KH 2D")],
      discard: [card("9D", 1)],
      opened: [true, false, false, false],
      melds: [tableMeld("m1", 1, cards("5D 6D 7D"))],
    });
    const plays = [
      { kind: "new-meld", cardIds: [card("9D", 1).id, card("9H").id, card("9S").id] },
      { kind: "add", meldId: "m1", cardIds: [card("8D").id] },
    ] as const;
    const took = expectOk(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays: [...plays] })).state;
    expect(took.round.melds).toHaveLength(2);
    expect(took.round.melds[0].cards).toHaveLength(4);
    expect(took.round.source).toBe("discard");
  });

  it("forbids discarding a card that fits a meld on the table", () => {
    const melds = [tableMeld("m1", 1, cards("5D 6D 7D")), tableMeld("m2", 1, cards("KH KC KS"))];
    const state = scenario({ hands: [cards("8D KD 2C")], melds });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    expect(expectError(applyAction(drawn, 0, { type: "DISCARD_CARD", cardId: card("8D").id }))).toMatch(/fits a meld on the table/i);
    expect(expectError(applyAction(drawn, 0, { type: "DISCARD_CARD", cardId: card("KD").id }))).toMatch(/fits a meld on the table/i);
    const done = expectOk(applyAction(drawn, 0, { type: "DISCARD_CARD", cardId: card("2C").id })).state;
    expect(done.round.activeSeat).toBe(1);
  });

  it("applies the discard rule to a player who has not opened as well", () => {
    const state = scenario({ hands: [cards("8D 2C")], melds: [tableMeld("m1", 1, cards("5D 6D 7D"))], stock: cards("JS", 1) });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    expect(drawn.round.opened[0]).toBe(false);
    expect(expectError(applyAction(drawn, 0, { type: "DISCARD_CARD", cardId: card("8D").id }))).toMatch(/fits a meld/i);
  });

  it("lets any card go when every card in hand fits the table, so a turn can always end", () => {
    const melds = [tableMeld("m1", 1, cards("5D 6D 7D")), tableMeld("m2", 1, cards("KH KC KS"))];
    const state = scenario({ hands: [cards("8D KD")], melds, stock: cards("4D", 1), opened: [true, false, false, false] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    const added = expectOk(applyAction(drawn, 0, { type: "PLAY", plays: [{ kind: "add", meldId: "m1", cardIds: [card("8D").id] }, { kind: "add", meldId: "m1", cardIds: [card("4D", 1).id] }] })).state;
    // Only the king is left. It fits the set of kings, but it is the last card, so going out with it is allowed.
    const out = expectOk(applyAction(added, 0, { type: "DISCARD_CARD", cardId: card("KD").id })).state;
    expect(out.lastResult?.winnerSeat).toBe(0);
  });

  it("ends the turn on discard and passes play clockwise", () => {
    const state = scenario({ hands: [cards("KH 2D")] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    expect(expectError(applyAction(state, 0, { type: "DISCARD_CARD", cardId: card("KH").id }))).toMatch(/take a card/i);
    const done = expectOk(applyAction(drawn, 0, { type: "DISCARD_CARD", cardId: card("KH").id })).state;
    expect(done.round.activeSeat).toBe(1);
    expect(done.round.phase).toBe("draw");
    expect(done.round.discard.at(-1)?.id).toBe(card("KH").id);
  });

  it("rebuilds the stock from the discard pile and keeps the top discard", () => {
    const pile = [...cards("2H 3H 4H 5H", 1), card("KD", 1)];
    const state = scenario({ hands: [cards("KH 2D")], stock: [card("9S", 1)], discard: pile });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    expect(drawn.round.discard.map((c) => c.id)).toEqual([card("KD", 1).id]);
    expect(drawn.round.stock.map((c) => c.id).sort()).toEqual(cards("2H 3H 4H 5H", 1).map((c) => c.id).sort());
  });

  it("ends the round with no winner when the stock cannot be rebuilt", () => {
    const state = scenario({ hands: [cards("KH 2D")], stock: [], discard: [card("KD", 1)] });
    const ended = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    expect(ended.status).toBe("round-end");
    expect(ended.lastResult?.blocked).toBe(true);
    expect(ended.lastResult?.winnerSeat).toBeNull();
    expect(ended.scores[0]).toBe(12);
  });
});

describe("opening", () => {
  const opener = cards("JC QC 10H 10S 10C 8D 9D 10D 2S");
  const big = [
    { kind: "new-meld", cardIds: [card("KC", 1).id, card("JC").id, card("QC").id] },
    { kind: "new-meld", cardIds: cards("10H 10S 10C").map((c) => c.id) },
    { kind: "new-meld", cardIds: cards("8D 9D 10D").map((c) => c.id) },
  ] as const;

  it("combines several melds to reach the threshold", () => {
    const state = scenario({ hands: [opener], discard: [card("KC", 1)] });
    const result = expectOk(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays: [...big] }));
    expect(result.state.round.opened[0]).toBe(true);
    expect(result.state.round.melds).toHaveLength(3);
    expect(result.log.join(" ")).toMatch(/opened with 87 points/);
  });

  it("rejects an opening below the threshold", () => {
    const state = scenario({ hands: [opener], discard: [card("KC", 1)] });
    const small = { type: "TAKE_DISCARD_AND_PLAY", plays: [big[0]] } as const;
    expect(expectError(applyAction(state, 0, small))).toMatch(/needs 65 points.*total 30/i);
    expect(state.round.opened[0]).toBe(false);
  });

  it("gives no opening points for a card added to a table meld", () => {
    const state = scenario({
      hands: [[...opener, card("4C")]],
      discard: [card("KC", 1)],
      melds: [tableMeld("m1", 1, cards("AC 2C 3C"))],
    });
    const plays = [...big, { kind: "add", meldId: "m1", cardIds: [card("4C").id] } as const];
    const result = expectOk(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays }));
    expect(result.log.join(" ")).toMatch(/opened with 87 points/);
  });

  it("gives no opening points for a joker replacement, which still hands over the joker", () => {
    const state = scenario({
      hands: [[...opener.filter((c) => c.id !== card("8D").id && c.id !== card("9D").id && c.id !== card("10D").id), card("JH")]],
      discard: [card("KC", 1)],
      melds: [tableMeld("m1", 1, [card("JC", 1), card("JD"), joker(0)])],
    });
    const plays = [big[0], big[1], { kind: "replace-joker", meldId: "m1", jokerId: joker(0).id, cardId: card("JH").id } as const];
    // Two melds are worth 60. The swap adds nothing, so the opening falls short of 65.
    expect(expectError(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays }))).toMatch(/needs 65 points.*total 60/i);
    // With a lower threshold the same plays open, and the swap still hands over the joker.
    const easier = { ...state, settings: { ...state.settings, openingThreshold: 60 } };
    const result = expectOk(applyAction(easier, 0, { type: "TAKE_DISCARD_AND_PLAY", plays }));
    expect(result.log.join(" ")).toMatch(/opened with 60 points/);
    expect(result.state.round.hands[0].some(isJoker)).toBe(true);
    expect(result.state.round.melds[0].cards.some((c) => isJoker(c.card))).toBe(false);
  });

  it("uses the configured threshold", () => {
    const state = scenario({ hands: [opener], discard: [card("KC", 1)], settings: { openingThreshold: 30 } });
    expectOk(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays: [big[0]] }));
  });

  it("opens with any legal play when the opening requirement is disabled", () => {
    const state = scenario({ hands: [cards("2H 2S 9D KH")], discard: [card("2C", 1)], settings: { openingRequired: false } });
    const plays = [{ kind: "new-meld", cardIds: [card("2C", 1).id, card("2H").id, card("2S").id] } as const];
    const result = expectOk(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays }));
    expect(result.state.round.opened[0]).toBe(true);
  });

  it("tracks the opened state of each player separately", () => {
    const state = scenario({ hands: [opener], discard: [card("KC", 1)], settings: { openingThreshold: 30 } });
    const next = expectOk(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays: [big[0]] })).state;
    expect(next.round.opened).toEqual([true, false, false, false]);
  });
});

describe("joker rules", () => {
  it("lets the exact natural card replace a table joker, which returns to the hand", () => {
    const meld = tableMeld("m1", 1, [card("5H"), joker(0), card("7H")]);
    const state = scenario({ hands: [[card("6H", 1), card("6D"), card("KH")]], opened: [true, false, false, false], melds: [meld] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    const wrong = { type: "PLAY", plays: [{ kind: "replace-joker", meldId: "m1", jokerId: joker(0).id, cardId: card("6D").id }] } as const;
    expect(expectError(applyAction(drawn, 0, wrong))).toMatch(/only the 6 of hearts/i);
    const right = { type: "PLAY", plays: [{ kind: "replace-joker", meldId: "m1", jokerId: joker(0).id, cardId: card("6H", 1).id }] } as const;
    const swapped = expectOk(applyAction(drawn, 0, right)).state;
    expect(swapped.round.hands[0].some(isJoker)).toBe(true);
    expect(swapped.round.melds[0].cards.some((c) => isJoker(c.card))).toBe(false);
    // The recovered joker does not need to be reused: the player may simply discard another card.
    const done = expectOk(applyAction(swapped, 0, { type: "DISCARD_CARD", cardId: card("KH").id })).state;
    expect(done.round.hands[0].some(isJoker)).toBe(true);
  });

  it("lets either missing ace replace the joker in a set of aces", () => {
    for (const code of ["AD", "AC"]) {
      const meld = tableMeld("m1", 1, [card("AS"), card("AH"), joker(0)]);
      const state = scenario({ hands: [[card(code), card("KH"), card("2D")]], opened: [true, false, false, false], melds: [meld] });
      const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
      const swap = { type: "PLAY", plays: [{ kind: "replace-joker", meldId: "m1", jokerId: joker(0).id, cardId: card(code).id }] } as const;
      const swapped = expectOk(applyAction(drawn, 0, swap)).state;
      expect(swapped.round.hands[0].some(isJoker)).toBe(true);
      expect(swapped.round.melds[0].cards.some((c) => isJoker(c.card))).toBe(false);
    }
    const meld = tableMeld("m1", 1, [card("AS"), card("AH"), joker(0)]);
    const state = scenario({ hands: [[card("AS", 1), card("KH"), card("2D")]], opened: [true, false, false, false], melds: [meld] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    const bad = { type: "PLAY", plays: [{ kind: "replace-joker", meldId: "m1", jokerId: joker(0).id, cardId: card("AS", 1).id }] } as const;
    expect(expectError(applyAction(drawn, 0, bad))).toMatch(/suit missing from the set/i);
  });

  it("does not allow a joker to be discarded while other cards remain", () => {
    const state = scenario({ hands: [[joker(0), card("KH")]] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    expect(expectError(applyAction(drawn, 0, { type: "DISCARD_CARD", cardId: joker(0).id }))).toMatch(/only as your very last card/i);
  });

  it("lets a player go out by discarding a joker as the very last card", () => {
    const state = scenario({
      hands: [[card("4C"), card("5C"), joker(0)]],
      discard: [card("3C", 1)],
      opened: [true, false, false, false],
    });
    const plays = [{ kind: "new-meld", cardIds: [card("3C", 1).id, card("4C").id, card("5C").id] } as const];
    const melded = expectOk(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays })).state;
    expect(expectError(applyAction(melded, 0, { type: "PASS_TURN" }))).toMatch(/must discard/i);
    const out = expectOk(applyAction(melded, 0, { type: "DISCARD_CARD", cardId: joker(0).id })).state;
    expect(out.lastResult?.winnerSeat).toBe(0);
    expect(out.scores[0]).toBe(0);
  });

  it("allows a joker onto a table meld only in the turn that goes out", () => {
    const melds = [tableMeld("m1", 1, cards("5D 6D 7D"))];
    const add = { type: "PLAY", plays: [{ kind: "add", meldId: "m1", cardIds: [joker(0).id] }] } as const;
    // Two cards would remain, so the joker may not be added.
    const early = scenario({ hands: [[joker(0), card("KH")]], melds, opened: [true, false, false, false] });
    const earlyDraw = expectOk(applyAction(early, 0, { type: "DRAW_FROM_STOCK" })).state;
    expect(expectError(applyAction(earlyDraw, 0, add))).toMatch(/only in the turn you go out/i);
    // Exactly one card remains, so the joker goes down and the last card is discarded to win.
    const late = scenario({ hands: [[joker(0)]], melds, opened: [true, false, false, false] });
    const lateDraw = expectOk(applyAction(late, 0, { type: "DRAW_FROM_STOCK" })).state;
    const added = expectOk(applyAction(lateDraw, 0, add)).state;
    expect(added.round.hands[0]).toHaveLength(1);
    const out = expectOk(applyAction(added, 0, { type: "DISCARD_CARD", cardId: added.round.hands[0][0].id })).state;
    expect(out.lastResult?.winnerSeat).toBe(0);
  });

  it("still lets a joker go into a new meld at any time", () => {
    const state = scenario({ hands: [[card("9H"), card("9S"), joker(0), card("KH"), card("2D")]], opened: [true, false, false, false] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    const play = { type: "PLAY", plays: [{ kind: "new-meld", cardIds: [card("9H").id, card("9S").id, joker(0).id] }] } as const;
    expect(expectOk(applyAction(drawn, 0, play)).state.round.melds).toHaveLength(1);
  });

  it("lets a player who holds only jokers pass instead of discarding", () => {
    const state = scenario({ hands: [[joker(0)]], stock: [joker(1)] });
    const drawn = expectOk(applyAction(state, 0, { type: "DRAW_FROM_STOCK" })).state;
    const passed = expectOk(applyAction(drawn, 0, { type: "PASS_TURN" })).state;
    expect(passed.round.activeSeat).toBe(1);
    expect(passed.status).toBe("playing");
    const normal = expectOk(applyAction(scenario({ hands: [cards("KH 2D")] }), 0, { type: "DRAW_FROM_STOCK" })).state;
    expect(expectError(applyAction(normal, 0, { type: "PASS_TURN" }))).toMatch(/must discard/i);
  });
});

describe("finishing and scoring", () => {
  it("scores remaining cards, with jokers at 25 and aces at 10", () => {
    expect(handPenalty([card("AH"), card("KH"), card("7D"), joker(0)])).toBe(52);
  });

  it("requires a final discard to win and scores the round", () => {
    const hands = [cards("4C 5C KH"), cards("AH KD 7S"), [joker(0), card("2D")], cards("QS")];
    const state = scenario({ hands, discard: [card("3C", 1)], opened: [true, false, false, false] });
    const plays = [{ kind: "new-meld", cardIds: [card("3C", 1).id, card("4C").id, card("5C").id] } as const];
    const melded = expectOk(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays })).state;
    expect(melded.status).toBe("playing");
    const won = expectOk(applyAction(melded, 0, { type: "DISCARD_CARD", cardId: card("KH").id })).state;
    expect(won.status).toBe("round-end");
    expect(won.lastResult?.winnerSeat).toBe(0);
    expect(won.lastResult?.penalties).toEqual([0, 27, 27, 10]);
    expect(won.scores).toEqual([0, 27, 27, 10]);
  });

  it("cannot go out by melding every card", () => {
    const state = scenario({ hands: [cards("4C 5C")], discard: [card("3C", 1)], opened: [true, false, false, false] });
    const plays = [{ kind: "new-meld", cardIds: [card("3C", 1).id, card("4C").id, card("5C").id] } as const];
    expect(expectError(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays }))).toMatch(/keep one card/i);
  });

  function finishRoundFor(seat: number, scores: number[], settings = {}) {
    const hands = [cards("6S 7S KH"), cards("QH"), cards("JH"), cards("9H")];
    hands[seat] = cards("2S");
    const state = scenario({ hands, scores, activeSeat: seat, settings, stock: cards("3D 3H", 1) });
    const drawn = expectOk(applyAction(state, seat, { type: "DRAW_FROM_STOCK" })).state;
    const kept = drawn.round.hands[seat];
    const first = expectOk(applyAction(drawn, seat, { type: "DISCARD_CARD", cardId: kept[0].id })).state;
    return first;
  }

  it("ends a score-limit match for everyone once a round completes over the limit", () => {
    const hands = [cards("6S 7S KH"), cards("QH 5D"), cards("JH"), cards("9H")];
    const state = scenario({ hands, scores: [50, 95, 20, 30], opened: [true, true, true, true], melds: [tableMeld("m1", 1, cards("5C 6C 7C"))] });
    state.round.discard = [card("8S")];
    const took = expectOk(applyAction(state, 0, {
      type: "TAKE_DISCARD_AND_PLAY",
      plays: [{ kind: "new-meld", cardIds: [card("8S").id, card("6S").id, card("7S").id] }],
    })).state;
    const won = expectOk(applyAction(took, 0, { type: "DISCARD_CARD", cardId: card("KH").id })).state;
    expect(won.scores).toEqual([50, 110, 30, 39]);
    expect(won.status).toBe("match-end");
    expect(won.matchWinnerSeat).toBe(2);
    expectError(startNextRound(won));
  });

  it("keeps playing a score-limit match while everyone is under the limit", () => {
    const state = finishRoundFor(0, [0, 0, 0, 0]);
    expect(state.status).toBe("playing");
  });

  it("ends a fixed-round match after the configured number of rounds", () => {
    const base = scenario({ hands: [cards("6S 7S KH"), cards("QH"), cards("JH"), cards("9H 2C")], settings: { matchFormat: "fixed-rounds", roundCount: 2 }, opened: [true, true, true, true], melds: [tableMeld("m1", 1, cards("5C 6C 7C"))], discard: [card("8S")] });
    const winRound = (s: typeof base) => {
      const took = expectOk(applyAction(s, 0, { type: "TAKE_DISCARD_AND_PLAY", plays: [{ kind: "new-meld", cardIds: [card("8S").id, card("6S").id, card("7S").id] }] })).state;
      return expectOk(applyAction(took, 0, { type: "DISCARD_CARD", cardId: card("KH").id })).state;
    };
    const afterOne = winRound(base);
    expect(afterOne.status).toBe("round-end");
    expect(afterOne.roundsCompleted).toBe(1);
    const second = expectOk(startNextRound(afterOne)).state;
    expect(second.round.roundNumber).toBe(2);
    expect(second.round.dealerSeat).toBe((afterOne.round.dealerSeat + 1) % 4);
    const replay = { ...second, round: { ...base.round, roundNumber: 2 } };
    const afterTwo = winRound(replay);
    expect(afterTwo.status).toBe("match-end");
    expect(afterTwo.matchWinnerSeat).toBe(0);
  });

  it("plays tiebreak rounds until one player has the uniquely lowest score", () => {
    const base = scenario({
      hands: [cards("6S 7S KH"), cards("QH"), cards("JH"), cards("9H")],
      settings: { matchFormat: "fixed-rounds", roundCount: 1 },
      scores: [10, 0, 50, 50],
      opened: [true, true, true, true],
      melds: [tableMeld("m1", 1, cards("5C 6C 7C"))],
      discard: [card("8S")],
    });
    const took = expectOk(applyAction(base, 0, { type: "TAKE_DISCARD_AND_PLAY", plays: [{ kind: "new-meld", cardIds: [card("8S").id, card("6S").id, card("7S").id] }] })).state;
    const tied = expectOk(applyAction(took, 0, { type: "DISCARD_CARD", cardId: card("KH").id })).state;
    expect(tied.scores).toEqual([10, 10, 60, 59]);
    expect(tied.status).toBe("round-end");
    expect(tied.tiebreak).toBe(true);
    expect(tied.matchWinnerSeat).toBeNull();
    expect(expectError(endMatchEarly(tied))).toMatch(/tied/i);
    const extra = expectOk(startNextRound(tied)).state;
    expect(extra.status).toBe("playing");
    expect(extra.tiebreak).toBe(true);
  });

  it("allows a voluntary early ending only with a uniquely lowest score", () => {
    const state = finishRoundFor(0, [0, 0, 0, 0]);
    expect(expectError(endMatchEarly(state))).toMatch(/between rounds/i);
    const between = scenario({ hands: [], scores: [3, 8, 8, 20] });
    between.status = "round-end";
    const ended = expectOk(endMatchEarly(between)).state;
    expect(ended.status).toBe("match-end");
    expect(ended.matchWinnerSeat).toBe(0);
    expect(uniqueLowestSeat([5, 5, 9])).toBeNull();
    expect(uniqueLowestSeat([5, 4, 9])).toBe(1);
  });

  it("gives a late joiner the current highest score", () => {
    const state = scenario({ hands: [], scores: [12, 40, 7, 33] });
    expect(applyLateJoin(state, 2).scores).toEqual([12, 40, 40, 33]);
  });
});
