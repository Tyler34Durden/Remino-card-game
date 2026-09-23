// The card-back designs a player can pick between. Adding one here is enough: the picker,
// the stock pile and the shuffle deck all read this list.
import type { MessageKey } from "./i18n.ts";

export type CardBackId = "classic" | "gold" | "azure" | "rose";

export interface CardBackDesign {
  id: CardBackId;
  /** Served from public/cards. */
  file: string;
  label: MessageKey;
}

export const CARD_BACKS: readonly CardBackDesign[] = [
  { id: "classic", file: "/cards/back-blue.png", label: "back.classic" },
  { id: "gold", file: "/cards/back-gold.svg", label: "back.gold" },
  { id: "azure", file: "/cards/back-azure.svg", label: "back.azure" },
  { id: "rose", file: "/cards/back-rose.svg", label: "back.rose" },
];

export const DEFAULT_CARD_BACK: CardBackId = "classic";

export function cardBackFile(id: CardBackId): string {
  return (CARD_BACKS.find((back) => back.id === id) ?? CARD_BACKS[0]).file;
}
