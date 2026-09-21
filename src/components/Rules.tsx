import { useEffect, useRef } from "react";
import type { RoomSettings } from "../../shared/types.ts";
import { DEFAULT_SETTINGS } from "../../shared/types.ts";
import { getLanguage, t } from "../i18n.ts";
import { RulesAr } from "./RulesAr.tsx";

interface RulesProps {
  settings: RoomSettings | null;
  onClose: () => void;
}

/** The rules of the game. Inside a room the text follows that room's settings. */
export function Rules({ settings, onClose }: RulesProps) {
  const s = settings ?? DEFAULT_SETTINGS;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <div className="panel panel-wide rules">
        <header className="panel-header">
          <h2 id="rules-title">{t("rules.title")}</h2>
          <button type="button" className="button" ref={closeRef} onClick={onClose}>
            {t("rules.close")}
          </button>
        </header>
        {settings && <p className="note">{t("rules.roomNote")}</p>}

        {getLanguage() === "ar" ? <RulesAr s={s} /> : <RulesEn s={s} />}
      </div>
    </div>
  );
}

function RulesEn({ s }: { s: RoomSettings }) {
  return (
    <>
        <h3>Goal</h3>
        <p>
          Get rid of every card in your hand. Scores are penalty points, so the lowest score wins. The first player to discard their final card wins the round and
          scores 0.
        </p>

        <h3>Cards and dealing</h3>
        <ul>
          <li>
            The game uses two standard decks{s.jokerCount > 0 ? ` plus ${s.jokerCount} ${s.jokerCount === 1 ? "joker" : "jokers"}, ${104 + s.jokerCount} cards in all` : " with no jokers, 104 cards in all"}. Identical cards from the two
            decks are separate cards.
          </li>
          <li>Each player receives 14 cards. The rest form the face-down stock, and one card starts the face-up discard pile.</li>
          <li>The dealer moves one seat clockwise every round. Play runs clockwise from the player to the left of the dealer.</li>
        </ul>

        <h3>Your turn</h3>
        <ol>
          <li>
            Take one card: either draw the top card of the <strong>stock</strong>, or take the <strong>top discard</strong>. You can never do both.
          </li>
          <li>Make the table plays your choice allows.</li>
          <li>Discard one card. That ends your turn. A joker may be discarded only when it is your very last card.</li>
          <li>You may not discard a card that could be added to a meld on the table. If every card you hold fits the table, any of them may go.</li>
        </ol>
        <ul>
          <li>
            <strong>After a stock draw</strong> you cannot open. If you have already opened, you may place new melds, add cards to melds on the table, and swap out
            table jokers, just as in any other turn.
          </li>
          <li>
            <strong>If you take the discard</strong> you must put that exact card into a new meld with cards from your hand during the same turn. Adding it to a meld
            already on the table does not count. You cannot keep it or discard it back. In this game you build your plays first and then confirm them, so an illegal
            take is never locked in.
          </li>
          <li>When the stock runs out, the discard pile is shuffled into a new stock. Its top card stays where it is.</li>
        </ul>

        <h3>Melds</h3>
        <ul>
          <li>
            A <strong>set</strong> is three or four cards of the same rank, each in a different suit. Two identical cards can never share a set.
          </li>
          <li>
            A <strong>run</strong> is three or more consecutive cards of one suit. The ace may be low (A-2-3) or high (Q-K-A). A run can never wrap around (K-A-2).
          </li>
          <li>Once you have opened, you may add cards to any meld on the table, no matter who played it.</li>
        </ul>

        <h3>Opening</h3>
        {s.openingRequired ? (
          <ul>
            <li>
              Your first table plays must total at least <strong>{s.openingThreshold} points</strong> in a single turn, and that turn must begin by taking the discard
              and using it in a new meld.
            </li>
            <li>Number cards count their face value. Jack, queen, and king count 10. An ace counts 1 in A-2-3 and 10 in Q-K-A or in a set.</li>
            <li>Only new melds count. A card you add to a meld already on the table, or one that replaces a joker, adds nothing to your opening total.</li>
            <li>Several melds and additions can be combined. Opening points only unlock play. They are never added to your score.</li>
          </ul>
        ) : (
          <p>
            This room has no opening threshold. Your first table play still has to begin by taking the discard and using it in a new meld. After that you count as
            opened.
          </p>
        )}

        {s.jokerCount > 0 && (
          <>
            <h3>Jokers</h3>
            <ul>
              <li>A joker can stand in for a missing card in a set or a run. In a run it stands for one exact card.</li>
              <li>In a set the joker stands for any suit that is still missing. With A♠ A♥ and a joker, either A♦ or A♣ can replace it.</li>
              <li>A new meld needs at least two natural cards.</li>
              <li>
                If you hold a card that a table joker stands for, you may swap it in and take the joker into your hand. You do not have to reuse the joker right away.
              </li>
              <li>A joker may be placed in a new meld at any time. It may be added to a meld already on the table only in the turn you go out, so that exactly one card is left to discard.</li>
              <li>A joker may be discarded only as your very last card. A joker left in your hand costs 25 points.</li>
              <li>If you hold two or more cards and all of them are jokers, you pass your turn without discarding.</li>
            </ul>
          </>
        )}

        <h3>Going out</h3>
        <p>
          You win the round by discarding your last card. You cannot go out by melding everything, so every table play must leave you one card to discard.
        </p>

        <h3>Scoring</h3>
        <ul>
          <li>The round winner scores 0. Cards on the table score nothing.</li>
          <li>Everyone else adds the cards left in their hand: number cards at face value, J, Q, K, and ace at 10{s.jokerCount > 0 ? ", jokers at 25" : ""}.</li>
          {s.matchFormat === "score-limit" ? (
            <li>
              The match ends after the round in which any player reaches <strong>{s.scoreLimit}</strong> penalty points. The lowest total wins.
            </li>
          ) : (
            <li>
              The match lasts <strong>{s.roundCount}</strong> rounds. The lowest total wins.
            </li>
          )}
          <li>A match never ends in a tie. If the lowest score is shared, extra rounds are played until one player is alone in the lead.</li>
        </ul>

        <h3>Rooms</h3>
        <ul>
          <li>Empty seats are filled by bots, which follow exactly the same rules.</li>
          <li>A player who joins during a match waits for the next round, replaces a bot, and starts with the current highest score.</li>
          <li>If you lose your connection, a bot covers your seat after a short wait. Reopen the page to take your seat back.</li>
          <li>If the host leaves, the room closes.</li>
        </ul>
    </>
  );
}
