import { CARD_BACKS } from "../cardBacks.ts";
import type { CardBackId } from "../cardBacks.ts";
import { t } from "../i18n.ts";

/**
 * Picks the design on the back of every face-down card.
 * The swatches are the designs themselves, so the choice needs no words.
 */
export function CardBackPicker({ value, onChange }: { value: CardBackId; onChange: (id: CardBackId) => void }) {
  return (
    <div className="back-picker" role="radiogroup" aria-label={t("back.title")}>
      <span className="back-picker-title">{t("back.title")}</span>
      <div className="back-picker-row">
        {CARD_BACKS.map((back) => (
          <button
            key={back.id}
            type="button"
            className={`back-swatch${back.id === value ? " back-swatch-on" : ""}`}
            role="radio"
            aria-checked={back.id === value}
            aria-label={t(back.label)}
            title={t(back.label)}
            onClick={() => onChange(back.id)}
          >
            <img src={back.file} alt="" draggable={false} />
            {back.id === value && (
              <span className="back-swatch-check" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
