import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import type { PublicRoomState } from "../../shared/types.ts";
import { t } from "../i18n.ts";
import type { Game } from "../net.ts";
import { playSound } from "../prefs.ts";
import type { Prefs } from "../prefs.ts";
import { localName } from "../serverText.ts";

type Ritual = NonNullable<PublicRoomState["shuffleRitual"]>;

interface Props {
  game: Game;
  room: PublicRoomState;
  ritual: Ritual;
  prefs: Prefs;
}

/** A shared animation gate. The actual shuffle and deal have already happened on the server. */
export function ShuffleRitual({ game, room, ritual, prefs }: Props) {
  const dealer = room.seats[ritual.dealerSeat];
  const isDealer = ritual.phase === "shuffling" && room.viewer.seat === ritual.dealerSeat && dealer?.kind === "human" && dealer.connected && !dealer.botControlled && game.connected;
  const [sending, setSending] = useState(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const previousSwipes = useRef(ritual.swipes);

  useEffect(() => {
    setSending(false);
    suppressClick.current = false;
    if (ritual.swipes > previousSwipes.current) playSound("shuffle", prefs.sound);
    previousSwipes.current = ritual.swipes;
  }, [ritual.swipes, prefs.sound]);

  const swipe = () => {
    if (!isDealer || sending) return;
    setSending(true);
    void game.shuffleSwipe().then((ok) => {
      if (!ok) setSending(false);
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    suppressClick.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 35) return;
    suppressClick.current = true;
    swipe();
  };

  const isDealing = ritual.phase === "dealing";
  const seatCount = room.seats.length;
  const flyingCards = isDealing
    ? Array.from({ length: seatCount * 3 + 3 }, (_, index) => {
        const toSelf = index >= seatCount * 3;
        const seat = index % seatCount;
        const wave = toSelf ? index - seatCount * 3 : Math.floor(index / seatCount);
        const x = toSelf ? (wave - 1) * 8 : (seat - (seatCount - 1) / 2) * (seatCount === 6 ? 14 : 18);
        const y = toSelf ? 28 : -25;
        const delay = toSelf ? 330 + wave * 120 : wave * 130 + seat * 50;
        return { index, style: { "--deal-x": `${x}vw`, "--deal-y": `${y}vh`, "--deal-delay": `${delay}ms` } as CSSProperties };
      })
    : [];

  return (
    <main className="shuffle-scene" aria-label={t("shuffle.title")}>
      <div className="shuffle-players" aria-label={t("shuffle.players")}>
        {room.seats.map((seat) => (
          <div key={seat.seat} className={`shuffle-player${seat.seat === ritual.dealerSeat ? " shuffle-player-dealer" : ""}`}>
            <span className={`seat-avatar avatar-portrait avatar-portrait-${seat.avatarId}`} aria-hidden="true" />
            <strong>{localName(seat.name)}</strong>
          </div>
        ))}
      </div>

      <div className="shuffle-center">
        <p className="shuffle-round">{room.tiebreak ? t("table.tiebreak", { number: room.roundNumber }) : t("table.round", { number: room.roundNumber })}</p>
        <h1>{isDealing ? t("shuffle.dealing") : t("shuffle.title")}</h1>
        <p className="shuffle-instruction" role="status">
          {isDealing ? t("shuffle.handsSoon") : isDealer ? t("shuffle.yourTurn") : t("shuffle.waiting", { name: localName(dealer?.name ?? "") })}
        </p>

        <div className={`shuffle-deck-zone${isDealing ? " shuffle-deck-dealing" : ""}`}>
          {flyingCards.map(({ index, style }) => <span key={index} className="shuffle-flying-card" style={style} aria-hidden="true" />)}
          <button
            key={ritual.swipes}
            type="button"
            className={`shuffle-deck${isDealer ? " shuffle-deck-active" : ""}${ritual.swipes > 0 ? " shuffle-deck-mixed" : ""}`}
            aria-label={t("shuffle.deckAction")}
            disabled={!isDealer || sending}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { pointerStart.current = null; }}
            onClick={() => {
              if (suppressClick.current) { suppressClick.current = false; return; }
              swipe();
            }}
          >
            <span className="shuffle-card-back shuffle-card-back-left" aria-hidden="true" />
            <span className="shuffle-card-back shuffle-card-back-right" aria-hidden="true" />
            <span className="shuffle-card-back shuffle-card-back-top" aria-hidden="true" />
          </button>
        </div>

        <div className="shuffle-progress" aria-label={t("shuffle.progress", { count: ritual.swipes })}>
          {[0, 1, 2].map((step) => <span key={step} className={step < ritual.swipes ? "done" : ""} aria-hidden="true" />)}
        </div>
        <p className="shuffle-counter">{isDealing ? t("shuffle.dealingHint") : t("shuffle.progress", { count: ritual.swipes })}</p>
      </div>
    </main>
  );
}
