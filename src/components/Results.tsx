import { useEffect, useRef } from "react";
import type { PublicRoomState } from "../../shared/types.ts";
import { penaltyValue } from "../../engine/cards.ts";
import { t } from "../i18n.ts";
import type { Game } from "../net.ts";
import { localName, serverText } from "../serverText.ts";
import { CardView } from "./CardView.tsx";

export function Results({ game, room, onHide, onLeave }: { game: Game; room: PublicRoomState; onHide: () => void; onLeave: () => void }) {
  const result = room.lastResult;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  if (!result) return null;

  const matchOver = room.status === "match-end";
  const winnerName = result.winnerSeat !== null ? localName(room.seats[result.winnerSeat].name) : null;
  const matchWinnerName = room.matchWinnerSeat !== null ? localName(room.seats[room.matchWinnerSeat].name) : null;
  const ranking = room.seats.slice().sort((a, b) => a.score - b.score);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="results-title">
      <div className="panel panel-wide results">
        <h2 id="results-title" tabIndex={-1} ref={headingRef}>
          {matchOver ? t("result.matchTitle") : t("result.roundTitle", { number: result.roundNumber })}
        </h2>
        {matchOver && matchWinnerName && <p className="headline">🏆 {t("result.matchWinner", { name: matchWinnerName })}</p>}
        <p>{winnerName ? t("result.winner", { name: winnerName }) : t("result.blocked")}</p>

        <div className="results-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t("result.player")}</th>
                <th scope="col">{t("result.remaining")}</th>
                <th scope="col" className="number">
                  {t("result.penalty")}
                </th>
                <th scope="col" className="number">
                  {t("result.total")}
                </th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((seat) => {
                const hand = result.hands[seat.seat] ?? [];
                const breakdown = hand.map((c) => penaltyValue(c)).join(" + ");
                return (
                  <tr key={seat.seat} className={seat.seat === result.winnerSeat ? "row-winner" : undefined}>
                    <th scope="row">
                      {localName(seat.name)}
                      {seat.seat === room.viewer.seat && <span className="tag tag-you">{t("lobby.you")}</span>}
                    </th>
                    <td>
                      {hand.length === 0 ? (
                        <span className="note">{t("result.noCards")}</span>
                      ) : (
                        <>
                          <span className="result-hand">
                            {hand.map((card) => (
                              <CardView key={card.id} card={card} small />
                            ))}
                          </span>
                          {seat.seat !== result.winnerSeat && hand.length > 1 && (
                            <span className="note breakdown">
                              {breakdown} = {result.penalties[seat.seat]}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="number">+{result.penalties[seat.seat]}</td>
                    <td className="number">
                      <strong>{seat.score}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!matchOver && <p role="status">{room.tiebreak ? t("result.tiebreak") : t("result.continues")}</p>}

        {game.error && (
          <p className="error" role="alert">
            {serverText(game.error)}
          </p>
        )}

        <div className="row row-end">
          <button type="button" className="button button-quiet" onClick={onHide}>
            {t("result.hide")}
          </button>
          {matchOver && (
            <button type="button" className="button" onClick={onLeave}>
              {t("prefs.leave")}
            </button>
          )}
          {room.viewer.isHost ? (
            matchOver ? (
              <button type="button" className="button button-primary" onClick={() => void game.startMatch()}>
                {t("result.playAgain")}
              </button>
            ) : (
              <>
                {room.canEndEarly && (
                  <button type="button" className="button" onClick={() => void game.endMatchEarly()}>
                    {t("result.endEarly")}
                  </button>
                )}
                <button type="button" className="button button-primary" onClick={() => void game.startNextRound()}>
                  {room.tiebreak ? t("result.nextTiebreak") : t("result.next")}
                </button>
              </>
            )
          ) : (
            <span className="note">{t("result.waitHost")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
