import { useState } from "react";
import type { FormEvent } from "react";
import type { RoomSettings } from "../../shared/types.ts";
import { DEFAULT_SETTINGS } from "../../shared/types.ts";
import { t } from "../i18n.ts";
import type { Game } from "../net.ts";
import { serverText } from "../serverText.ts";
import { SettingsForm } from "./SettingsForm.tsx";

const NAME_KEY = "romino-name";

function initialCode(): string {
  return (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase().slice(0, 6);
}

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function Home({ game, onRules }: { game: Game; onRules: () => void }) {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(initialCode);
  const [creating, setCreating] = useState(false);
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checkName = (): string | null => {
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError(t("home.nameRequired"));
      return null;
    }
    setLocalError(null);
    try {
      localStorage.setItem(NAME_KEY, trimmed);
    } catch {
      // Remembering the name is only a convenience.
    }
    return trimmed;
  };

  const run = async (task: () => Promise<boolean>) => {
    setBusy(true);
    const entered = await task();
    setBusy(false);
    if (entered) window.history.replaceState(null, "", window.location.pathname);
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const player = checkName();
    if (player) void run(() => game.joinRoom(player, code));
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    const player = checkName();
    if (player) void run(() => game.createRoom(player, settings));
  };

  const error = localError ?? (game.error ? serverText(game.error) : null);

  return (
    <main className="home">
      <header className="home-hero">
        <h1>{t("app.title")}</h1>
        <p>{t("app.tagline")}</p>
      </header>

      <section className="panel">
        <label className="field">
          <span>{t("home.name")}</span>
          <input
            type="text"
            value={name}
            maxLength={20}
            autoComplete="nickname"
            placeholder={t("home.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {creating ? (
          <form onSubmit={create} className="stack">
            <SettingsForm value={settings} onChange={setSettings} />
            <div className="row">
              <button type="button" className="button" onClick={() => setCreating(false)}>
                {t("home.back")}
              </button>
              <button type="submit" className="button button-primary" disabled={busy || !game.connected}>
                {t("home.createButton")}
              </button>
            </div>
          </form>
        ) : (
          <div className="stack">
            <button type="button" className="button button-primary button-large" onClick={() => setCreating(true)}>
              {t("home.create")}
            </button>
            <form onSubmit={join} className="join">
              <label className="field">
                <span>{t("home.code")}</span>
                <input
                  type="text"
                  value={code}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("home.codePlaceholder")}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                />
              </label>
              <button type="submit" className="button" disabled={busy || !game.connected || code.length !== 6}>
                {t("home.joinButton")}
              </button>
            </form>
            <button type="button" className="button button-quiet" onClick={onRules}>
              {t("home.rules")}
            </button>
          </div>
        )}
        {!game.connected && <p className="note">{t("app.connecting")}</p>}
      </section>
    </main>
  );
}
