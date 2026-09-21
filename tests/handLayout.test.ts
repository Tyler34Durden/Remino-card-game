import { describe, expect, it } from "vitest";
import { groupCards, layoutByRank, layoutBySuit, moveCard, normalizeLayout, shiftCard } from "../src/handLayout.ts";
import { cards, joker } from "./helpers.ts";

describe("hand arranging", () => {
  it("keeps an untouched hand as one group and appends new cards", () => {
    expect(normalizeLayout([], ["a", "b"])).toEqual([["a", "b"]]);
    expect(normalizeLayout([["a", "b"]], ["a", "b", "c"])).toEqual([["a", "b", "c"]]);
  });

  it("drops cards that left the hand and puts new cards in a trailing group", () => {
    const layout = [["a", "b"], ["c"], ["d"]];
    expect(normalizeLayout(layout, ["a", "d", "e"])).toEqual([["a"], ["d"], ["e"]]);
    expect(normalizeLayout([["a", "a"], ["a", "b"]], ["a", "b"])).toEqual([["a"], ["b"]]);
  });

  it("moves a card before or after another card, across groups", () => {
    const layout = [["a", "b", "c"], ["d", "e"]];
    expect(moveCard(layout, "a", { kind: "card", cardId: "e", after: false })).toEqual([["b", "c"], ["d", "a", "e"]]);
    expect(moveCard(layout, "d", { kind: "card", cardId: "a", after: true })).toEqual([["a", "d", "b", "c"], ["e"]]);
    expect(moveCard(layout, "c", { kind: "card", cardId: "a", after: false })).toEqual([["c", "a", "b"], ["d", "e"]]);
    expect(moveCard(layout, "a", { kind: "card", cardId: "a", after: true })).toBe(layout);
  });

  it("starts a new group and removes groups that become empty", () => {
    expect(moveCard([["a", "b"], ["c"]], "a", { kind: "new-group" })).toEqual([["b"], ["c"], ["a"]]);
    expect(moveCard([["a"], ["b"]], "a", { kind: "card", cardId: "b", after: true })).toEqual([["b", "a"]]);
  });

  it("groups the selected cards together at the front, in hand order", () => {
    expect(groupCards([["a", "b", "c"], ["d", "e"]], ["e", "b"])).toEqual([["b", "e"], ["a", "c"], ["d"]]);
    expect(groupCards([["a"]], [])).toEqual([["a"]]);
  });

  it("nudges a card one step and hops between groups at the edges", () => {
    const layout = [["a", "b"], ["c", "d"]];
    expect(shiftCard(layout, "a", 1)).toEqual([["b", "a"], ["c", "d"]]);
    expect(shiftCard(layout, "b", 1)).toEqual([["a"], ["b", "c", "d"]]);
    expect(shiftCard(layout, "c", -1)).toEqual([["a", "b", "c"], ["d"]]);
    expect(shiftCard(layout, "a", -1)).toEqual([["a"], ["b"], ["c", "d"]]);
    expect(shiftCard(layout, "d", 1)).toEqual([["a", "b"], ["c"], ["d"]]);
  });

  it("never loses or duplicates a card", () => {
    let layout = [["a", "b", "c"], ["d", "e"], ["f"]];
    const steps = [
      (l: string[][]) => moveCard(l, "f", { kind: "card", cardId: "a", after: false }),
      (l: string[][]) => groupCards(l, ["c", "d"]),
      (l: string[][]) => shiftCard(l, "c", -1),
      (l: string[][]) => moveCard(l, "b", { kind: "new-group" }),
      (l: string[][]) => shiftCard(l, "b", 1),
    ];
    for (const step of steps) {
      layout = step(layout);
      expect(layout.flat().sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
      expect(layout.every((group) => group.length > 0)).toBe(true);
    }
  });

  it("groups by suit in rank order with jokers last", () => {
    const hand = [...cards("KH 3C 2H AC 9S"), joker(0)];
    const layout = layoutBySuit(hand);
    expect(layout).toEqual([cards("AC 3C").map((c) => c.id), cards("2H KH").map((c) => c.id), cards("9S").map((c) => c.id), [joker(0).id]]);
  });

  it("groups by rank, pairing up ranks held more than once", () => {
    const hand = [...cards("7H KS 7C 2D KD 7S"), joker(0)];
    const layout = layoutByRank(hand);
    expect(layout).toEqual([cards("7C 7H 7S").map((c) => c.id), cards("KD KS").map((c) => c.id), [cards("2D")[0].id, joker(0).id]]);
  });
});
