import { useEffect, useState } from "react";
import { directionOf, initialLanguage, setLanguage, t } from "./i18n.ts";
import type { Language } from "./i18n.ts";
import { serverText } from "./serverText.ts";
import { useSoloGame } from "./soloGame.ts";
import { usePrefs } from "./prefs.ts";
import { CardBackPicker } from "./components/CardBackPicker.tsx";
import { Home } from "./components/Home.tsx";
import { Lobby } from "./components/Lobby.tsx";
import { Results } from "./components/Results.tsx";
import { Rules } from "./components/Rules.tsx";
import { settingsSummary } from "./components/SettingsForm.tsx";
import { Table } from "./components/Table.tsx";
import { ShuffleRitual } from "./components/ShuffleRitual.tsx";

export function App() {
  const game = useSoloGame();
  const { prefs, dark, toggle, toggleTheme, setCardBack } = usePrefs();
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  // Every t() call reads the module-level language, so it must be set before the children render.
  setLanguage(language);
  const [showRules, setShowRules] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  // Phones fold the top bar buttons into a menu. Desktop shows them all the time.
  const [menuOpen, setMenuOpen] = useState(false);
  const room = game.room;

  useEffect(() => {
    document.documentElement.dir = directionOf(language);
    document.documentElement.lang = language;
    document.title = language === "ar" ? "رومينو — لعبة ورق عبر الإنترنت" : "Romino — Online Card Game";
  }, [language]);

  const themeSwitch = (
    <button type="button" className="button button-small theme-switch" onClick={toggleTheme}>
      {dark ? "☀️" : "🌙"} {dark ? t("prefs.light") : t("prefs.dark")}
    </button>
  );

  const languageSwitch = (
    <button type="button" className="button button-small language-switch" lang={language === "ar" ? "en" : "ar"} onClick={() => setLanguageState(language === "ar" ? "en" : "ar")}>
      {t("app.language")}
    </button>
  );

  // Each new result opens the results panel again.
  useEffect(() => setResultsHidden(false), [room?.status, room?.roundNumber]);

  const leave = () => {
    if (!room) return;
    const inMatch = room.status !== "lobby";
    const message = room.viewer.isHost ? t("prefs.leaveConfirmHost") : inMatch ? t("prefs.leaveConfirm") : null;
    if (message && !window.confirm(message)) return;
    void game.leave();
  };

  if (game.closedReason) {
    return (
      <div className="overlay" role="alertdialog" aria-modal="true" aria-labelledby="closed-title">
        <div className="panel">
          <h2 id="closed-title">{t("closed.title")}</h2>
          <p>{serverText(game.closedReason)}</p>
          <button type="button" className="button button-primary" onClick={game.dismissClosed} autoFocus>
            {t("closed.ok")}
          </button>
        </div>
      </div>
    );
  }

  if (game.restoring) {
    return (
      <main className="home">
        <p className="note" role="status">
          {t("app.connecting")}
        </p>
      </main>
    );
  }

  const rules = showRules && <Rules settings={room?.settings ?? null} onClose={() => setShowRules(false)} />;

  if (!room) {
    return (
      <>
        <div className="language-corner">
          {themeSwitch}
          {languageSwitch}
        </div>
        <Home game={game} onRules={() => setShowRules(true)} backPicker={<CardBackPicker value={prefs.cardBack} onChange={setCardBack} />} />
        {rules}
      </>
    );
  }

  if (room.status === "lobby") {
    return (
      <>
        <div className="language-corner">
          {themeSwitch}
          {languageSwitch}
        </div>
        <Lobby game={game} room={room} onRules={() => setShowRules(true)} onLeave={leave} />
        {rules}
      </>
    );
  }

  const hasResult = (room.status === "round-end" || room.status === "match-end") && room.lastResult !== null;

  return (
    <div className="game">
      <header className="topbar">
        <div className="topbar-title">
          <strong>{room.tiebreak ? t("table.tiebreak", { number: room.roundNumber }) : t("table.round", { number: room.roundNumber })}</strong>
        </div>
        <ul className="chips topbar-chips">
          {settingsSummary(room.settings).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <button type="button" className="button button-small menu-toggle" aria-expanded={menuOpen} aria-controls="topbar-menu" aria-label={t("app.menu")} onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? "✕" : "☰"}
        </button>
        <div className={`topbar-actions${menuOpen ? " topbar-actions-open" : ""}`} id="topbar-menu">
          {languageSwitch}
          {themeSwitch}
          <button type="button" className="button button-small" aria-pressed={prefs.sound} onClick={() => toggle("sound")}>
            {prefs.sound ? "🔊" : "🔇"} {t("prefs.sound")}
          </button>
          <button type="button" className="button button-small" aria-pressed={prefs.reducedMotion} onClick={() => toggle("reducedMotion")}>
            {t("prefs.motion")}
          </button>
          <button type="button" className="button button-small" onClick={() => setShowRules(true)}>
            {t("prefs.rules")}
          </button>
          <button type="button" className="button button-small" onClick={leave}>
            {t("prefs.leave")}
          </button>
          <CardBackPicker value={prefs.cardBack} onChange={setCardBack} />
        </div>
      </header>

      {!game.connected && (
        <p className="banner" role="status">
          {t("app.offline")}
        </p>
      )}

      {room.shuffleRitual ? <ShuffleRitual game={game} room={room} ritual={room.shuffleRitual} prefs={prefs} /> : <Table game={game} room={room} prefs={prefs} />}

      {hasResult && !resultsHidden && <Results game={game} room={room} onHide={() => setResultsHidden(true)} onLeave={leave} />}
      {hasResult && resultsHidden && (
        <button type="button" className="button button-primary floating" onClick={() => setResultsHidden(false)}>
          {t("result.show")}
        </button>
      )}
      {rules}
    </div>
  );
}
