import type { Card, JokerRef } from "../../shared/types.ts";
import { refLabel } from "../../engine/cards.ts";
import { ltr, t } from "../i18n.ts";

export function cardName(card: Card): string {
  if (card.rank === "JOKER" || card.suit === null) return t("card.joker");
  const rank = card.rank === "A" || card.rank === "J" || card.rank === "Q" || card.rank === "K" ? t(`rank.${card.rank}`) : card.rank;
  return t("card.of", { rank, suit: t(`suit.${card.suit}`) });
}

function cardImage(card: Card): string {
  if (card.rank === "JOKER" || card.suit === null) return "/cards/joker.png";
  return `/cards/${card.suit}-${card.rank}.png`;
}

interface CardViewProps {
  card: Card;
  selected?: boolean;
  /** Short text badge, such as "Must use". Never rely on colour alone. */
  badge?: string | null;
  represents?: JokerRef | null;
  small?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  actionLabel?: string;
}

/** A face-up card. It is a button when it can be clicked, so keyboards and screen readers can use it. */
export function CardView({ card, selected = false, badge = null, represents = null, small = false, disabled = false, onClick, actionLabel }: CardViewProps) {
  const standsFor = represents ? (represents.suit === null ? t("table.jokerAsAny", { rank: represents.rank }) : t("table.jokerAs", { card: ltr(refLabel(represents)) })) : "";
  const name = represents ? `${cardName(card)} (${standsFor})` : cardName(card);
  const className = `card${small ? " card-small" : ""}${selected ? " card-selected" : ""}${badge ? " card-badged" : ""}`;
  const content = (
    <>
      <img src={cardImage(card)} alt="" draggable={false} />
      {represents && <span className="card-represents">{refLabel(represents)}</span>}
      {badge && <span className="card-badge">{badge}</span>}
      {selected && <span className="card-check" aria-hidden="true">✓</span>}
    </>
  );
  if (!onClick) {
    return (
      <span className={className} role="img" aria-label={name}>
        {content}
      </span>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-pressed={actionLabel ? undefined : selected} aria-label={actionLabel ? `${actionLabel}: ${name}` : name}>
      {content}
    </button>
  );
}

export function CardBack({ small = false, color = "blue" }: { small?: boolean; color?: "blue" | "red" }) {
  return (
    <span className={`card${small ? " card-small" : ""}`} role="img" aria-label={t("card.back")}>
      <img src={`/cards/back-${color}.png`} alt="" draggable={false} />
    </span>
  );
}
