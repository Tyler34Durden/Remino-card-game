import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { RoomSettings } from "../../shared/types.ts";
import type { AvatarId } from "../../shared/avatars.ts";
import { DEFAULT_SETTINGS } from "../../shared/types.ts";
import { t } from "../i18n.ts";
import type { Game } from "../net.ts";
import { serverText } from "../serverText.ts";
import { SettingsForm } from "./SettingsForm.tsx";

const NAME_KEY = "romino-name";

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function Home({ game, onRules, toolbar, backPicker, backgroundPicker, avatarPicker, avatarId }: { game: Game; onRules: () => void; toolbar: ReactNode; backPicker?: ReactNode; backgroundPicker: ReactNode; avatarPicker: ReactNode; avatarId: AvatarId }) {
  const [name, setName] = useState(savedName);
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

  const create = (e: FormEvent) => {
    e.preventDefault();
    const player = checkName();
    if (player) void run(() => game.createRoom(player, settings, avatarId));
  };

  const error = localError ?? (game.error ? serverText(game.error) : null);

  return (
    <main className={`home home-entry${creating ? " home-configuring" : ""}`}>
      <div className="home-topline">{toolbar}</div>
      <div className="home-content">
        <header className="home-hero">
          <div className="home-card-fan" aria-hidden="true">
            <img src="/cards/hearts-A.png" alt="" />
            <img src="/cards/diamonds-A.png" alt="" />
            <img src="/cards/clubs-A.png" alt="" />
            <img src="/cards/spades-A.png" alt="" />
          </div>
          <h1>{t("app.title")}</h1>
          <p>{t("app.taglineSolo")}</p>
        </header>

        <section className="home-form-area">
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
                  {t("home.playSolo")}
                </button>
              </div>
            </form>
          ) : (
            <div className="stack">
              <button type="button" className="button button-primary button-large" onClick={() => setCreating(true)}>
                {t("home.playSolo")}
              </button>
              <button type="button" className="button button-quiet" onClick={onRules}>
                {t("home.rules")}
              </button>
            </div>
          )}
          <details className="home-style">
            <summary>{t("home.style")}</summary>
            <div className="home-style-options">
              {avatarPicker}
              {backgroundPicker}
              {backPicker}
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}
