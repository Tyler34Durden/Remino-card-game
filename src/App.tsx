import { useEffect, useState } from "react";
import { directionOf, initialLanguage, setLanguage, t } from "./i18n.ts";
import type { Language } from "./i18n.ts";
import { localName, serverText } from "./serverText.ts";
import { useSoloGame } from "./soloGame.ts";
import { usePrefs } from "./prefs.ts";
import { CardBackPicker } from "./components/CardBackPicker.tsx";
import { TableBackgroundPicker } from "./components/TableBackgroundPicker.tsx";
import { AvatarPicker } from "./components/AvatarPicker.tsx";
import type { AvatarId } from "../shared/avatars.ts";
import { Home } from "./components/Home.tsx";
import { Lobby } from "./components/Lobby.tsx";
import { Results } from "./components/Results.tsx";
import { Rules } from "./components/Rules.tsx";
import { Table } from "./components/Table.tsx";
import { ShuffleRitual } from "./components/ShuffleRitual.tsx";

export function App() {
  const game = useSoloGame();
  const { prefs, dark, toggle, toggleTheme, setCardBack, setAvatar, setTableBackground } = usePrefs();
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  // Every t() call reads the module-level language, so it must be set before the children render.
  setLanguage(language);
  const [showRules, setShowRules] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  // Phones fold the top bar buttons into a menu. Desktop shows them all the time.
  const [menuOpen, setMenuOpen] = useState(false);
  const room = game.room;

  const chooseAvatar = (id: AvatarId) => {
    setAvatar(id);
    if (room) void game.updateAvatar(id);
  };

  const avatarPicker = <AvatarPicker value={prefs.avatarId} onChange={chooseAvatar} />;

  useEffect(() => {
    document.documentElement.dir = directionOf(language);
    document.documentElement.lang = language;
    document.title = language === "ar" ? "ريمينو — لعبة ورق عبر الإنترنت" : "Remino — Online Card Game";
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
        <Home
          game={game}
          onRules={() => setShowRules(true)}
          avatarId={prefs.avatarId}
          avatarPicker={avatarPicker}
          backgroundPicker={<TableBackgroundPicker value={prefs.tableBackground} onChange={setTableBackground} />}
          backPicker={<CardBackPicker value={prefs.cardBack} onChange={setCardBack} />}
        />
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
        <Lobby game={game} room={room} onRules={() => setShowRules(true)} onLeave={leave} avatarPicker={avatarPicker} />
        {rules}
      </>
    );
  }

  const hasResult = (room.status === "round-end" || room.status === "match-end") && room.lastResult !== null;

  return (
    <div className="game">
      <header className="topbar">
        <div className="topbar-title">
          <strong>{t("app.title")}</strong>
          <span>{localName(room.viewer.name)}</span>
        </div>
        <button type="button" className="button button-small menu-toggle" aria-expanded={menuOpen} aria-controls="topbar-menu" aria-label={t("app.menu")} onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? "✕" : "☰"}
        </button>
        <div className={`topbar-actions${menuOpen ? " topbar-actions-open" : ""}`} id="topbar-menu">
          <strong className="topbar-menu-heading">{t("app.menu")}</strong>
          <div className="topbar-menu-group">
            <button type="button" className="topbar-menu-row" onClick={() => setLanguageState(language === "ar" ? "en" : "ar")}>
              <span>{t("prefs.language")}</span><span className="topbar-menu-value">{language === "ar" ? "العربية" : "English"}</span>
            </button>
            <button type="button" className="topbar-menu-row" onClick={toggleTheme}>
              <span>{t("prefs.theme")}</span><span className="topbar-menu-value">{dark ? t("prefs.dark") : t("prefs.light")}</span>
            </button>
            <button type="button" className="topbar-menu-row" aria-pressed={prefs.sound} onClick={() => toggle("sound")}>
              <span>{t("prefs.sound")}</span><span className="topbar-menu-value">{prefs.sound ? t("prefs.on") : t("prefs.off")}</span>
            </button>
            <button type="button" className="topbar-menu-row" aria-pressed={prefs.reducedMotion} onClick={() => toggle("reducedMotion")}>
              <span>{t("prefs.motion")}</span><span className="topbar-menu-value">{prefs.reducedMotion ? t("prefs.on") : t("prefs.off")}</span>
            </button>
          </div>
          <div className="topbar-menu-group topbar-menu-footer">
            <button type="button" className="topbar-menu-row" onClick={() => { setMenuOpen(false); setShowRules(true); }}>
              <span>{t("prefs.rules")}</span><span aria-hidden="true">›</span>
            </button>
            <button type="button" className="topbar-menu-row topbar-menu-leave" onClick={() => { setMenuOpen(false); leave(); }}>
              <span>{t("prefs.leave")}</span><span aria-hidden="true">›</span>
            </button>
          </div>
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
