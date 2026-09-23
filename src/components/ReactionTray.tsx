import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { t } from "../i18n.ts";
import { ReactionIcon } from "./ReactionIcon.tsx";
import type { ReactionKind } from "./ReactionIcon.tsx";

export const REACTIONS = [
  { kind: "tea", label: "reaction.tea", shortLabel: "reaction.teaShort" },
  { kind: "coffee", label: "reaction.coffee", shortLabel: "reaction.coffeeShort" },
  { kind: "hookah", label: "reaction.hookah", shortLabel: "reaction.hookahShort" },
  { kind: "bravo", label: "reaction.bravo", shortLabel: "reaction.bravoShort" },
] as const;

export function ReactionTray({ triggerRef, onChoose, onClose }: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  onChoose: (kind: ReactionKind) => void;
  onClose: (restoreFocus?: boolean) => void;
}) {
  const trayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trayRef.current?.querySelector("button")?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !trayRef.current?.contains(target) && !triggerRef.current?.contains(target)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(true); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [onClose, triggerRef]);

  return (
    <div ref={trayRef} className="reaction-tray" id="reaction-tray" role="group" aria-label={t("reaction.open")} onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const buttons = Array.from(event.currentTarget.querySelectorAll("button"));
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const step = (event.key === "ArrowRight" ? 1 : -1) * (document.documentElement.dir === "rtl" ? -1 : 1);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + step + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[next]?.focus({ preventScroll: true });
    }}>
      {REACTIONS.map(({ kind, label, shortLabel }) => (
        <button key={kind} type="button" className="reaction-option" aria-label={t(label)} title={t(label)} onClick={() => onChoose(kind)}>
          <span className="reaction-option-art"><ReactionIcon kind={kind} /></span>
          <span className="reaction-option-label">{t(shortLabel)}</span>
        </button>
      ))}
    </div>
  );
}
