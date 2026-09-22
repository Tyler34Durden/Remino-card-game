import type { PublicRoomState } from "../../shared/types.ts";
import { t } from "../i18n.ts";
import type { Game } from "../net.ts";
import { localName, serverText } from "../serverText.ts";
import { SettingsForm, settingsSummary } from "./SettingsForm.tsx";

export function Lobby({ game, room, onRules, onLeave }: { game: Game; room: PublicRoomState; onRules: () => void; onLeave: () => void }) {
  const isHost = room.viewer.isHost;
  const emptySeats = room.seats.filter((s) => s.kind === "empty").length;

  return (
    <main className="lobby">
      <section className="panel">
        <header className="panel-header">
          <h1>{t("lobby.title")}</h1>
          <div className="row">
            <button type="button" className="button button-quiet" onClick={onRules}>
              {t("prefs.rules")}
            </button>
            <button type="button" className="button button-quiet" onClick={onLeave}>
              {t("lobby.leave")}
            </button>
          </div>
        </header>

        <h2>{t("lobby.seats")}</h2>
        <ol className="seat-list">
          {room.seats.map((seat) => (
            <li key={seat.seat} className={`seat-row seat-${seat.kind}`}>
              <span className="seat-number">{seat.seat + 1}</span>
              {seat.kind === "empty" ? (
                <span className="seat-empty">{t("lobby.empty")}</span>
              ) : (
                <span className="seat-name">
                  {localName(seat.name)}
                  {seat.isHost && <span className="tag">{t("lobby.host")}</span>}
                  {seat.playerId === room.viewer.playerId && <span className="tag tag-you">{t("lobby.you")}</span>}
                  {seat.kind === "bot" && <span className="tag">{t("lobby.bot")}</span>}
                  {!seat.connected && <span className="tag tag-warn">{t("table.offline")}</span>}
                </span>
              )}
            </li>
          ))}
        </ol>
        {emptySeats > 0 && <p className="note">{t("lobby.botsNote", { count: emptySeats })}</p>}

        {game.error && (
          <p className="error" role="alert">
            {serverText(game.error)}
          </p>
        )}

        {isHost ? (
          <>
            <SettingsForm value={room.settings} onChange={(next) => void game.updateSettings(next)} />
            <button type="button" className="button button-primary button-large" onClick={() => void game.startMatch()}>
              {t("lobby.start")}
            </button>
          </>
        ) : (
          <>
            <h2>{t("settings.title")}</h2>
            <ul className="chips">
              {settingsSummary(room.settings).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="note" role="status">
              {t("lobby.waitingHost")}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
