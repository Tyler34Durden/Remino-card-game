import { useCallback, useEffect, useState } from "react";
import { cardBackFile, DEFAULT_CARD_BACK } from "./cardBacks.ts";
import type { CardBackId } from "./cardBacks.ts";
import { DEFAULT_AVATAR, isAvatarId } from "../shared/avatars.ts";
import type { AvatarId } from "../shared/avatars.ts";
import { DEFAULT_TABLE_BACKGROUND, isTableBackgroundId, tableBackgroundFile } from "./tableBackgrounds.ts";
import type { TableBackgroundId } from "./tableBackgrounds.ts";
import type { ReactionKind } from "./components/ReactionIcon.tsx";

const PREFS_KEY = "romino-prefs";

export type ThemeChoice = "system" | "light" | "dark";

export interface Prefs {
  sound: boolean;
  botReactions: boolean;
  reducedMotion: boolean;
  theme: ThemeChoice;
  cardBack: CardBackId;
  avatarId: AvatarId;
  tableBackground: TableBackgroundId;
}

/** The preferences that are a plain on or off. */
export type BooleanPref = "sound" | "botReactions" | "reducedMotion";

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function systemPrefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function loadPrefs(): Prefs {
  const fallback: Prefs = { sound: true, botReactions: true, reducedMotion: systemPrefersReducedMotion(), theme: "system", cardBack: DEFAULT_CARD_BACK, avatarId: DEFAULT_AVATAR, tableBackground: DEFAULT_TABLE_BACKGROUND };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...fallback,
      ...saved,
      botReactions: typeof saved.botReactions === "boolean" ? saved.botReactions : fallback.botReactions,
      avatarId: isAvatarId(saved.avatarId) ? saved.avatarId : DEFAULT_AVATAR,
      tableBackground: isTableBackgroundId(saved.tableBackground) ? saved.tableBackground : DEFAULT_TABLE_BACKGROUND,
    };
  } catch {
    return fallback;
  }
}

export function usePrefs(): { prefs: Prefs; dark: boolean; toggle: (key: BooleanPref) => void; toggleTheme: () => void; setCardBack: (id: CardBackId) => void; setAvatar: (id: AvatarId) => void; setTableBackground: (id: TableBackgroundId) => void } {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // While the choice is "system", follow the device if it changes theme mid-game.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // "system" is resolved here, so the stylesheet only ever needs one dark selector.
  const dark = prefs.theme === "system" ? systemDark : prefs.theme === "dark";

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);

  // Every face-down card reads this one variable, so no component needs to know the choice.
  useEffect(() => {
    document.documentElement.style.setProperty("--card-back", `url("${cardBackFile(prefs.cardBack)}")`);
  }, [prefs.cardBack]);

  useEffect(() => {
    document.documentElement.style.setProperty("--table-background", `url("${tableBackgroundFile(prefs.tableBackground)}")`);
  }, [prefs.tableBackground]);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(prefs.reducedMotion);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Preferences simply last for this tab when storage is unavailable.
    }
  }, [prefs]);

  const toggle = useCallback((key: BooleanPref) => setPrefs((p) => ({ ...p, [key]: !p[key] })), []);
  const toggleTheme = useCallback(() => setPrefs((p) => ({ ...p, theme: (p.theme === "system" ? systemPrefersDark() : p.theme === "dark") ? "light" : "dark" })), []);
  const setCardBack = useCallback((id: CardBackId) => setPrefs((p) => ({ ...p, cardBack: id })), []);
  const setAvatar = useCallback((id: AvatarId) => setPrefs((p) => ({ ...p, avatarId: id })), []);
  const setTableBackground = useCallback((id: TableBackgroundId) => setPrefs((p) => ({ ...p, tableBackground: id })), []);
  return { prefs, dark, toggle, toggleTheme, setCardBack, setAvatar, setTableBackground };
}

let audio: AudioContext | null = null;

export type SoundName = "turn" | "card" | "shuffle" | "win" | "error";

const TONES: Record<SoundName, { frequency: number; duration: number; type: OscillatorType }[]> = {
  turn: [
    { frequency: 660, duration: 0.09, type: "sine" },
    { frequency: 880, duration: 0.12, type: "sine" },
  ],
  card: [{ frequency: 320, duration: 0.05, type: "triangle" }],
  shuffle: [],
  win: [
    { frequency: 523, duration: 0.12, type: "sine" },
    { frequency: 659, duration: 0.12, type: "sine" },
    { frequency: 784, duration: 0.2, type: "sine" },
  ],
  error: [{ frequency: 180, duration: 0.15, type: "square" }],
};

/** Quiet original Foley, scheduled to the SVG beats; cancellation also stops future notes. */
export function playReactionSound(kind: ReactionKind, enabled: boolean): () => void {
  const sources: AudioScheduledSourceNode[] = [];
  const cancel = () => {
    for (const source of sources) {
      try { source.stop(); } catch { /* An already-ended note needs no cleanup. */ }
    }
  };
  if (!enabled) return cancel;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume().catch(() => {});
    const context = audio;
    const start = context.currentTime;
    const note = (frequency: number, offset: number, duration: number, volume: number, endFrequency = frequency) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(frequency, start + offset);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + offset + duration);
      gain.gain.setValueAtTime(0, start + offset);
      gain.gain.linearRampToValueAtTime(volume, start + offset + .003);
      gain.gain.exponentialRampToValueAtTime(.0001, start + offset + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      sources.push(oscillator);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + duration);
    };
    if (kind === "tea") {
      note(2350, .9, .18, .018);
      note(3580, .9, .1, .007);
    } else if (kind === "coffee") {
      note(1180, .46, .1, .014);
      note(520, .46, .075, .014);
    } else if (kind === "hookah") {
      note(260, .4, .09, .018, 115);
      note(320, .51, .085, .014, 140);
      note(240, .61, .075, .01, 100);
    } else {
      for (const offset of [.35, .73]) {
        const duration = .085;
        const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / samples.length * 7);
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        source.buffer = buffer;
        filter.type = "bandpass";
        filter.frequency.value = 1450;
        filter.Q.value = .7;
        gain.gain.value = .04;
        source.connect(filter).connect(gain).connect(context.destination);
        source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
        sources.push(source);
        source.start(start + offset);
        source.stop(start + offset + duration);
      }
    }
  } catch { cancel(); /* Audio is optional, including on browsers that block it. */ }
  return cancel;
}

/** Plays a short synthesized tone. There are no audio files to download. */
export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  try {
    audio ??= new AudioContext();
    if (name === "shuffle") {
      const length = Math.floor(audio.sampleRate * 0.16);
      const buffer = audio.createBuffer(1, length, audio.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      source.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.value = 1900;
      filter.Q.value = 0.6;
      gain.gain.value = 0.14;
      source.connect(filter).connect(gain).connect(audio.destination);
      source.start();
      return;
    }
    let start = audio.currentTime;
    for (const tone of TONES[name]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = tone.type;
      oscillator.frequency.value = tone.frequency;
      gain.gain.setValueAtTime(0.06, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + tone.duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + tone.duration);
      start += tone.duration;
    }
  } catch {
    // Browsers may block audio until the first interaction. Silence is an acceptable fallback.
  }
}
