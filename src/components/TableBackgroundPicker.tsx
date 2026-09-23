import { TABLE_BACKGROUNDS } from "../tableBackgrounds.ts";
import type { TableBackgroundId } from "../tableBackgrounds.ts";
import { t } from "../i18n.ts";

export function TableBackgroundPicker({ value, onChange }: { value: TableBackgroundId; onChange: (id: TableBackgroundId) => void }) {
  return (
    <div className="table-background-picker" role="radiogroup" aria-label={t("tableBackground.title")}>
      <span className="table-background-picker-title">{t("tableBackground.title")}</span>
      <div className="table-background-picker-row">
        {TABLE_BACKGROUNDS.map((background) => (
          <button
            key={background.id}
            type="button"
            className={`table-background-option${background.id === value ? " table-background-option-on" : ""}`}
            role="radio"
            aria-checked={background.id === value}
            aria-label={t(background.label)}
            onClick={() => onChange(background.id)}
          >
            <img src={background.file} alt="" draggable={false} />
            <span>{t(background.label)}</span>
            {background.id === value && <span className="table-background-check" aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
