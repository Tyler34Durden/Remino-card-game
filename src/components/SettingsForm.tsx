import { useEffect, useState } from "react";
import { MAX_JOKERS } from "../../shared/types.ts";
import type { RoomSettings, SeatCount } from "../../shared/types.ts";
import { t } from "../i18n.ts";

interface SettingsFormProps {
  value: RoomSettings;
  onChange: (next: RoomSettings) => void;
  disabled?: boolean;
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function jokerLabel(count: number): string {
  if (count === 0) return t("settings.jokersNone");
  return count === 1 ? t("settings.jokersOne") : t("settings.jokersOption", { count });
}

/** Lets the player type freely and applies the limits only when they leave the field. */
function NumberField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (next: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const next = clampInt(text, min, max, value);
    setText(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </label>
  );
}

export function SettingsForm({ value, onChange, disabled = false }: SettingsFormProps) {
  const set = <K extends keyof RoomSettings>(key: K, next: RoomSettings[K]) => onChange({ ...value, [key]: next });
  return (
    <fieldset className="settings" disabled={disabled}>
      <legend>{t("settings.title")}</legend>

      <label className="field">
        <span>{t("settings.seats")}</span>
        <select value={value.seatCount} onChange={(e) => set("seatCount", Number(e.target.value) as SeatCount)}>
          {[4, 5, 6].map((count) => (
            <option key={count} value={count}>
              {t("settings.seatsOption", { count })}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>{t("settings.jokers")}</span>
        <select value={value.jokerCount} onChange={(e) => set("jokerCount", Number(e.target.value))}>
          {Array.from({ length: MAX_JOKERS + 1 }, (_, count) => (
            <option key={count} value={count}>
              {jokerLabel(count)}
            </option>
          ))}
        </select>
      </label>

      <label className="field field-check">
        <input type="checkbox" checked={value.openingRequired} onChange={(e) => set("openingRequired", e.target.checked)} />
        <span>{t("settings.opening")}</span>
      </label>

      {value.openingRequired && (
        <NumberField label={t("settings.threshold")} value={value.openingThreshold} min={1} max={300} onCommit={(next) => set("openingThreshold", next)} />
      )}

      <label className="field">
        <span>{t("settings.format")}</span>
        <select value={value.matchFormat} onChange={(e) => set("matchFormat", e.target.value as RoomSettings["matchFormat"])}>
          <option value="score-limit">{t("settings.scoreLimit")}</option>
          <option value="fixed-rounds">{t("settings.fixedRounds")}</option>
        </select>
      </label>

      {value.matchFormat === "score-limit" ? (
        <NumberField label={t("settings.limit")} value={value.scoreLimit} min={10} max={2000} onCommit={(next) => set("scoreLimit", next)} />
      ) : (
        <NumberField label={t("settings.rounds")} value={value.roundCount} min={1} max={50} onCommit={(next) => set("roundCount", next)} />
      )}
    </fieldset>
  );
}

export function settingsSummary(settings: RoomSettings): string[] {
  return [
    t("settings.seatsOption", { count: settings.seatCount }),
    jokerLabel(settings.jokerCount),
    settings.openingRequired ? t("settings.summaryOpening", { points: settings.openingThreshold }) : t("settings.summaryNoOpening"),
    settings.matchFormat === "score-limit" ? t("settings.summaryLimit", { limit: settings.scoreLimit }) : t("settings.summaryRounds", { count: settings.roundCount }),
  ];
}
