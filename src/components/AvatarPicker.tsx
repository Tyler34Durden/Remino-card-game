import { AVATAR_IDS } from "../../shared/avatars.ts";
import type { AvatarId } from "../../shared/avatars.ts";
import { t } from "../i18n.ts";

export function AvatarPicker({ value, onChange }: { value: AvatarId; onChange: (id: AvatarId) => void }) {
  return (
    <div className="avatar-picker" role="radiogroup" aria-label={t("avatar.title")}>
      <span className="avatar-picker-title">{t("avatar.title")}</span>
      <div className="avatar-picker-row">
        {AVATAR_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`avatar-option${id === value ? " avatar-option-on" : ""}`}
            role="radio"
            aria-checked={id === value}
            aria-label={t("avatar.option", { number: id + 1 })}
            onClick={() => onChange(id)}
          >
            <span className={`avatar-portrait avatar-portrait-${id}`} aria-hidden="true" />
            {id === value && <span className="avatar-option-check" aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
