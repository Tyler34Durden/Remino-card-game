import { useCallback, useEffect, useState } from "react";

const PREFS_KEY = "romino-prefs";

export type ThemeChoice = "system" | "light" | "dark";

export interface Prefs {
  sound: boolean;
  reducedMotion: boolean;
  theme: ThemeChoice;
}

/** The preferences that are a plain on or off. */
export type BooleanPref = "sound" | "reducedMotion";

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function systemPrefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function loadPrefs(): Prefs {
  const fallback: Prefs = { sound: true, reducedMotion: systemPrefersReducedMotion(), theme: "system" };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Prefs>) } : fallback;
  } catch {
    return fallback;
  }
}

export function usePrefs(): { prefs: Prefs; dark: boolean; toggle: (key: BooleanPref) => void; toggleTheme: () => void } {
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
  return { prefs, dark, toggle, toggleTheme };
}

let audio: AudioContext | null = null;

export type SoundName = "turn" | "card" | "win" | "error";

const TONES: Record<SoundName, { frequency: number; duration: number; type: OscillatorType }[]> = {
  turn: [
    { frequency: 660, duration: 0.09, type: "sine" },
    { frequency: 880, duration: 0.12, type: "sine" },
  ],
  card: [{ frequency: 320, duration: 0.05, type: "triangle" }],
  win: [
    { frequency: 523, duration: 0.12, type: "sine" },
    { frequency: 659, duration: 0.12, type: "sine" },
    { frequency: 784, duration: 0.2, type: "sine" },
  ],
  error: [{ frequency: 180, duration: 0.15, type: "square" }],
};

/** Plays a short synthesized tone. There are no audio files to download. */
export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  try {
    audio ??= new AudioContext();
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
