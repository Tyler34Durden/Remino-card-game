import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/types.ts";
import { applyAction } from "../engine/game.ts";
import { planHand, valueOf } from "../src/meldPlanner.ts";
import { card, cards, expectOk, joker, scenario } from "./helpers.ts";

describe("meld calculator", () => {
  it("values sets and runs like the opening rules", () => {
    expect(valueOf(cards("9H 9C 9S"))).toMatchObject({ valid: true, type: "set", points: 27 });
    expect(valueOf(cards("AH 2H 3H"))).toMatchObject({ valid: true, type: "run", points: 6 });
    expect(valueOf(cards("QC KC AC"))).toMatchObject({ valid: true, type: "run", points: 30 });
    expect(valueOf(cards("AH AC AS"))).toMatchObject({ valid: true, type: "set", points: 30 });
    expect(valueOf([card("5H"), joker(0), card("7H")])).toMatchObject({ valid: true, type: "run", points: 18 });
  });

  it("explains cards that are not a meld and stays quiet for fewer than three", () => {
    const bad = valueOf(cards("KD AD 2D"));
    expect(bad.valid).toBe(false);
    expect(bad.points).toBe(0);
    expect(bad.reason).toMatch(/cannot wrap/i);
    expect(valueOf(cards("9H 9C"))).toEqual({ valid: false, type: null, points: 0, reason: null });
  });

  it("adds up the groups that are ready and ignores the rest", () => {
    const plan = planHand([cards("10H 10S 10C"), cards("8D 9D 10D"), cards("2S 7C KH")], null);
    expect(plan.groups.map((g) => g.points)).toEqual([30, 27, 0]);
    expect(plan.readyPoints).toBe(57);
    expect(plan.pointsWithDiscard).toBeNull();
    expect(plan.discardGroup).toBeNull();
  });

  it("finds the group the discard completes and the total it would give", () => {
    const groups = [cards("JC QC"), cards("10H 10S 10C"), cards("8D 9D 10D"), cards("2S")];
    const plan = planHand(groups, card("KC", 1));
    expect(plan.readyPoints).toBe(57);
    expect(plan.groups[0]).toMatchObject({ valid: false, pointsWithDiscard: 30 });
    expect(plan.groups[3].pointsWithDiscard).toBeNull();
    expect(plan.pointsWithDiscard).toBe(87);
    expect(plan.discardGroup).toBe(0);
  });

  it("counts only the gain when the discard extends a group that is already a meld", () => {
    const plan = planHand([cards("8D 9D 10D"), cards("5H 5C")], card("JD", 1));
    expect(plan.readyPoints).toBe(27);
    expect(plan.groups[0].pointsWithDiscard).toBe(37);
    expect(plan.pointsWithDiscard).toBe(37);
  });

  it("picks the better group when the discard fits two of them", () => {
    const plan = planHand([cards("2H 2S"), cards("3C 4C")], card("2C", 1));
    expect(plan.groups.map((g) => g.pointsWithDiscard)).toEqual([6, 9]);
    expect(plan.pointsWithDiscard).toBe(9);
    expect(plan.discardGroup).toBe(1);
  });

  it("promises exactly what the server accepts as an opening", () => {
    const groups = [cards("JC QC"), cards("10H 10S 10C"), cards("8D 9D 10D")];
    const discard = card("KC", 1);
    const plan = planHand(groups, discard);
    expect(plan.pointsWithDiscard).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.openingThreshold);

    const state = scenario({ hands: [[...groups.flat(), card("2S")]], discard: [discard] });
    const plays = groups.map((group, index) => ({ kind: "new-meld" as const, cardIds: [...group.map((c) => c.id), ...(index === plan.discardGroup ? [discard.id] : [])] }));
    const result = expectOk(applyAction(state, 0, { type: "TAKE_DISCARD_AND_PLAY", plays }));
    expect(result.log.join(" ")).toContain(`opened with ${plan.pointsWithDiscard} points`);
  });
});
