import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/types.ts";
import { botViewOf, chooseBotAction } from "../engine/bot.ts";
import { applyAction, createMatch, endMatchEarly, startNextRound, validateSettings } from "../engine/game.ts";
import { explainInvalidMeld } from "../engine/melds.ts";
import { RoomManager } from "../server/rooms.ts";
import { ar } from "../src/i18n.ar.ts";
import { setLanguage, t } from "../src/i18n.ts";
import { localName, serverText } from "../src/serverText.ts";
import { card, cards, joker, scenario, tableMeld } from "./helpers.ts";

const LATIN_WORD = /[A-Za-z]{3,}/;

/** True when the Arabic text still contains an English word, ignoring player and bot names. */
function hasEnglish(text: string, names: string[] = []): boolean {
  let rest = text;
  for (const name of names) rest = rest.split(name).join("");
  return LATIN_WORD.test(rest);
}

beforeEach(() => setLanguage("ar"));
afterEach(() => setLanguage("en"));

describe("Arabic dictionary", () => {
  it("keeps every placeholder of the English text", () => {
    for (const key of Object.keys(ar) as (keyof typeof ar)[]) {
      setLanguage("en");
      const english = t(key);
      const placeholders = english.match(/\{\w+\}/g) ?? [];
      for (const placeholder of placeholders) expect(ar[key], key).toContain(placeholder);
    }
  });

  it("fills in parameters", () => {
    expect(t("table.round", { number: 3 })).toBe("الجولة 3");
    setLanguage("en");
    expect(t("table.round", { number: 3 })).toBe("Round 3");
  });
});

describe("server text in Arabic", () => {
  it("leaves English untouched when the language is English", () => {
    setLanguage("en");
    expect(serverText("It is not your turn.")).toBe("It is not your turn.");
    expect(localName("Bot Hamza")).toBe("Bot Hamza");
  });

  it("gives bots Arabic names and leaves human names alone", () => {
    expect(localName("Bot Hamza")).toBe("الروبوت حمزة");
    expect(localName("Mohey")).toBe("Mohey");
  });

  it("translates every log line of full bot matches", () => {
    const names = ["Bot Salem", "Bot Hamza", "Bot Faraj", "Bot Mansour", "Bot Younes", "Bot Khalifa"];
    for (const settings of [DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, openingRequired: false, seatCount: 6 as const, jokerCount: 8 }]) {
      let state = createMatch(settings, 4);
      const lines = new Set<string>();
      for (let step = 0; step < 20000 && state.status !== "match-end"; step++) {
        const result = state.status === "round-end" ? startNextRound(state) : applyAction(state, state.round.activeSeat, chooseBotAction(botViewOf(state, state.round.activeSeat)));
        if (!result.ok) throw new Error(result.error);
        state = result.state;
        for (const line of result.log) lines.add(line.replace(/\{(\d+)\}/g, (_, seat: string) => names[Number(seat)]));
      }
      expect(lines.size).toBeGreaterThan(20);
      for (const line of lines) {
        const arabic = serverText(line);
        expect(arabic, line).not.toBe(line);
        expect(hasEnglish(arabic), `${line} -> ${arabic}`).toBe(false);
      }
    }
  });

  it("translates the rejection messages of the rules engine", () => {
    const messages = new Set<string>();
    const collect = (result: { ok: boolean; error?: string }) => {
      if (!result.ok && result.error) messages.add(result.error);
    };
    const meld = tableMeld("m1", 1, [card("AS"), card("AH"), joker(0)]);
    const run = tableMeld("m2", 1, [card("5H"), joker(1), card("7H")]);
    const base = scenario({ hands: [cards("4C 5C 9H 9S KH 2D")], discard: [card("3C", 1)], melds: [meld, run] });
    const opened = scenario({ hands: [[...cards("4C 5C 9H 9S KH 2D AS"), joker(2)]], discard: [card("3C", 1)], melds: [meld, run], opened: [true, false, false, false] });
    const newMeld = (ids: string[]) => ({ kind: "new-meld", cardIds: ids }) as const;

    collect(applyAction(base, 1, { type: "DRAW_FROM_STOCK" }));
    collect(applyAction(base, 9, { type: "DRAW_FROM_STOCK" }));
    collect(applyAction(base, 0, { type: "DISCARD_CARD", cardId: card("KH").id }));
    collect(applyAction(base, 0, { type: "PLAY", plays: [newMeld([card("9H").id])] }));
    collect(applyAction(base, 0, { type: "PASS_TURN" }));
    collect(applyAction(base, 0, { type: "TAKE_DISCARD_AND_PLAY", plays: [] }));
    collect(applyAction(base, 0, { type: "TAKE_DISCARD_AND_PLAY", plays: [newMeld([card("3C", 1).id, card("4C").id, card("5C").id])] }));
    collect(applyAction(opened, 0, { type: "TAKE_DISCARD_AND_PLAY", plays: [{ kind: "add", meldId: "m1", cardIds: [card("3C", 1).id] }] }));
    const drawn = applyAction(opened, 0, { type: "DRAW_FROM_STOCK" });
    if (!drawn.ok) throw new Error(drawn.error);
    const afterDraw = drawn.state;
    collect(applyAction(afterDraw, 0, { type: "DRAW_FROM_STOCK" }));
    collect(applyAction(afterDraw, 0, { type: "PASS_TURN" }));
    collect(applyAction(afterDraw, 0, { type: "DISCARD_CARD", cardId: joker(2).id }));
    collect(applyAction(afterDraw, 0, { type: "DISCARD_CARD", cardId: "nope" }));
    collect(applyAction(afterDraw, 0, { type: "PLAY", plays: [newMeld([card("9H").id, card("9S").id])] }));
    collect(applyAction(afterDraw, 0, { type: "PLAY", plays: [newMeld([card("9H").id, card("4C").id, card("KH").id])] }));
    collect(applyAction(afterDraw, 0, { type: "PLAY", plays: [newMeld(["nope", "a", "b"])] }));
    collect(applyAction(afterDraw, 0, { type: "PLAY", plays: [{ kind: "add", meldId: "gone", cardIds: [card("KH").id] }] }));
    collect(applyAction(afterDraw, 0, { type: "PLAY", plays: [{ kind: "add", meldId: "m2", cardIds: [card("KH").id, card("2D").id] }] }));
    collect(applyAction(afterDraw, 0, { type: "PLAY", plays: [{ kind: "replace-joker", meldId: "m1", jokerId: joker(0).id, cardId: card("AS").id }] }));
    collect(applyAction(afterDraw, 0, { type: "PLAY", plays: [{ kind: "replace-joker", meldId: "m2", jokerId: joker(1).id, cardId: card("KH").id }] }));
    collect(applyAction(afterDraw, 0, { type: "PLAY", plays: [{ kind: "replace-joker", meldId: "m2", jokerId: "nope", cardId: card("KH").id }] }));
    collect(applyAction(scenario({ hands: [cards("8D KH")], melds: [run] }), 0, { type: "DISCARD_CARD", cardId: card("KH").id }));
    const unopenedDraw = applyAction(scenario({ hands: [cards("8D KH")], melds: [run] }), 0, { type: "DRAW_FROM_STOCK" });
    if (unopenedDraw.ok) collect(applyAction(unopenedDraw.state, 0, { type: "PLAY", plays: [{ kind: "add", meldId: "m2", cardIds: [card("8D").id] }] }));
    const blocked = scenario({ hands: [cards("8H KH 2D")], melds: [run] });
    const blockedDraw = applyAction(blocked, 0, { type: "DRAW_FROM_STOCK" });
    if (blockedDraw.ok) collect(applyAction(blockedDraw.state, 0, { type: "DISCARD_CARD", cardId: card("8H").id }));
    expect([...messages].some((m) => m.includes("fits a meld on the table"))).toBe(true);
    collect(startNextRound(base));
    collect(endMatchEarly(base));
    const tied = scenario({ hands: [], scores: [5, 5, 9, 9] });
    tied.status = "round-end";
    collect(endMatchEarly(tied));
    for (const group of [cards("2H 2C"), [card("8H"), joker(0), joker(1)], [card("2H"), card("2H", 1), card("2C")], cards("KD AD 2D"), cards("2H 3C 4S"), cards("5H 5C 5D 5S 5H")]) {
      messages.add(explainInvalidMeld(group));
    }
    for (const bad of [{ seatCount: 3 }, { openingThreshold: 0 }, { scoreLimit: 1 }, { roundCount: 0 }, { jokerCount: 99 }, { matchFormat: "x" }]) {
      const problem = validateSettings({ ...DEFAULT_SETTINGS, ...bad } as never);
      if (problem) messages.add(problem);
    }

    expect(messages.size).toBeGreaterThan(25);
    for (const message of messages) {
      const arabic = serverText(message);
      expect(arabic, message).not.toBe(message);
      expect(hasEnglish(arabic), `${message} -> ${arabic}`).toBe(false);
    }
  });

  it("translates room messages, room log lines, and closing reasons", () => {
    vi.useFakeTimers();
    const closed: string[] = [];
    const manager = new RoomManager({ onUpdate: () => undefined, onClosed: (_room, reason) => closed.push(reason) }, { botDelayMs: 5, reconnectGraceMs: 50, hostGraceMs: 200, seed: () => 3 });
    const errors = new Set<string>();
    const note = (result: { ok: boolean; error?: string }) => {
      if (!result.ok && result.error) errors.add(result.error);
    };
    const host = manager.createRoom("Mona", DEFAULT_SETTINGS);
    if (!host.ok) throw new Error(host.error);
    const code = host.data.roomCode;
    note(manager.createRoom("  ", DEFAULT_SETTINGS));
    note(manager.joinRoom("Omar", "NOPE99"));
    note(manager.joinRoom("mona", code));
    const friend = manager.joinRoom("Omar", code);
    if (!friend.ok) throw new Error(friend.error);
    note(manager.startMatch(code, friend.data.playerId));
    note(manager.updateSettings(code, friend.data.playerId, DEFAULT_SETTINGS));
    note(manager.startNextRound(code, host.data.playerId));
    note(manager.reconnect({ ...friend.data, token: "bad" }));
    manager.startMatch(code, host.data.playerId);
    note(manager.startMatch(code, host.data.playerId));
    note(manager.updateSettings(code, host.data.playerId, DEFAULT_SETTINGS));
    note(manager.endMatchEarly(code, host.data.playerId));
    note(manager.gameAction(code, host.data.playerId, { type: "DRAW_FROM_STOCK" }, -1));
    const late = manager.joinRoom("Lina", code);
    if (!late.ok) throw new Error(late.error);
    note(manager.gameAction(code, late.data.playerId, { type: "DRAW_FROM_STOCK" }));
    note(manager.reclaimSeat(code, late.data.playerId));
    manager.joinRoom("Sami", code);
    note(manager.joinRoom("Extra", code));
    manager.markDisconnected(code, friend.data.playerId);
    vi.advanceTimersByTime(60);
    manager.markConnected(code, friend.data.playerId);
    manager.markDisconnected(code, friend.data.playerId);
    manager.markConnected(code, friend.data.playerId);
    manager.leaveRoom(code, friend.data.playerId);
    const room = manager.rooms.get(code);
    const lines = [...(room?.log ?? [])];
    manager.markDisconnected(code, host.data.playerId);
    vi.advanceTimersByTime(60);
    lines.push(...(manager.rooms.get(code)?.log ?? []));
    vi.advanceTimersByTime(500);
    note(manager.leaveRoom(code, host.data.playerId));
    manager.shutdown();
    vi.useRealTimers();

    const names = ["Mona", "Omar", "Lina", "Sami", "Bot Salem", "Bot Hamza", "Bot Faraj", "Bot Mansour"];
    expect(closed.length).toBeGreaterThan(0);
    for (const text of [...errors, ...new Set(lines), ...closed, "The room was idle for too long.", "The server is restarting."]) {
      const arabic = serverText(text);
      expect(arabic, text).not.toBe(text);
      expect(hasEnglish(arabic, names), `${text} -> ${arabic}`).toBe(false);
    }
  });
});
