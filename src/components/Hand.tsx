import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Card } from "../../shared/types.ts";
import { t } from "../i18n.ts";
import type { DropTarget, HandLayout } from "../handLayout.ts";
import type { GroupPlan } from "../meldPlanner.ts";
import { CardView } from "./CardView.tsx";

interface HandProps {
  cards: readonly Card[];
  layout: HandLayout;
  selected: readonly string[];
  badgeFor: (card: Card) => string | null;
  onToggle: (cardId: string) => void;
  onMove: (cardId: string, target: DropTarget) => void;
  /** The meld calculator's verdict for each group, in layout order. */
  plans?: readonly GroupPlan[];
  /** Label of the face-up discard, such as "K♣", for groups it would complete. */
  discardLabel?: string | null;
  /** Plays a whole group in one tap. Absent when no table play is legal right now. */
  onPlayGroup?: (index: number) => void;
}

interface DragState {
  cardId: string;
  originX: number;
  originY: number;
  x: number;
  y: number;
  target: DropTarget | null;
}

const MOUSE_THRESHOLD = 6;
const TOUCH_HOLD_MS = 250;
const TOUCH_SLOP = 10;

/**
 * The player's hand, shown as the groups they arranged.
 * A mouse drags straight away. A finger must rest on a card briefly first, so the page can still scroll.
 */
export function Hand({ cards, layout, selected, badgeFor, onToggle, onMove, plans, discardLabel, onPlayGroup }: HandProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pending = useRef<{ cardId: string; x: number; y: number; pointerId: number; touch: boolean; timer: number | null } | null>(null);
  const suppressClick = useRef(false);
  // The latest callback is kept in a ref so the window listeners are attached only once.
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  const byId = new Map(cards.map((card) => [card.id, card]));

  const findTarget = useCallback((x: number, y: number, draggedId: string): DropTarget | null => {
    const container = containerRef.current;
    if (!container) return null;
    const zone = container.querySelector<HTMLElement>("[data-new-group]");
    if (zone) {
      const r = zone.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { kind: "new-group" };
    }
    let best: { id: string; rect: DOMRect; distance: number } | null = null;
    for (const element of container.querySelectorAll<HTMLElement>("[data-card-id]")) {
      const id = element.dataset.cardId as string;
      if (id === draggedId) continue;
      const rect = element.getBoundingClientRect();
      // A card directly under the pointer always wins. Later cards are drawn on top, so the last match is kept.
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        best = { id, rect, distance: -1 };
        continue;
      }
      if (best && best.distance === -1) continue;
      // Rows matter more than columns, so a card in the row under the pointer always wins.
      const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      const dx = Math.abs(x - (rect.left + rect.width / 2));
      const distance = dy * 4 + dx;
      if (!best || distance < best.distance) best = { id, rect, distance };
    }
    if (!best) return null;
    const rtl = getComputedStyle(container).direction === "rtl";
    const pastCentre = x > best.rect.left + best.rect.width / 2;
    return { kind: "card", cardId: best.id, after: rtl ? !pastCentre : pastCentre };
  }, []);

  const startDrag = useCallback(
    (cardId: string, x: number, y: number) => {
      const next: DragState = { cardId, originX: x, originY: y, x, y, target: findTarget(x, y, cardId) };
      dragRef.current = next;
      setDrag(next);
    },
    [findTarget],
  );

  useEffect(() => {
    const clearPending = () => {
      if (pending.current?.timer) window.clearTimeout(pending.current.timer);
      pending.current = null;
    };

    const onMovePointer = (event: PointerEvent) => {
      const waiting = pending.current;
      if (dragRef.current) {
        const next: DragState = { ...dragRef.current, x: event.clientX, y: event.clientY, target: findTarget(event.clientX, event.clientY, dragRef.current.cardId) };
        dragRef.current = next;
        setDrag(next);
        return;
      }
      if (!waiting || waiting.pointerId !== event.pointerId) return;
      const moved = Math.hypot(event.clientX - waiting.x, event.clientY - waiting.y);
      if (waiting.touch) {
        // Moving before the hold completes means the player is scrolling, not dragging.
        if (moved > TOUCH_SLOP) clearPending();
      } else if (moved > MOUSE_THRESHOLD) {
        startDrag(waiting.cardId, event.clientX, event.clientY);
        clearPending();
      }
    };

    const finish = (commit: boolean) => {
      clearPending();
      const current = dragRef.current;
      if (!current) return;
      dragRef.current = null;
      setDrag(null);
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 0);
      // A hold that never travelled is not a move.
      const travelled = Math.hypot(current.x - current.originX, current.y - current.originY) > MOUSE_THRESHOLD;
      if (commit && travelled && current.target) onMoveRef.current(current.cardId, current.target);
    };

    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(false);
    };
    // While a card is being dragged by touch, stop the page from scrolling underneath it.
    const onTouchMove = (event: TouchEvent) => {
      if (dragRef.current && event.cancelable) event.preventDefault();
    };

    window.addEventListener("pointermove", onMovePointer);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      clearPending();
      window.removeEventListener("pointermove", onMovePointer);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [findTarget, startDrag]);

  const onPointerDown = (cardId: string, event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const touch = event.pointerType !== "mouse";
    const { clientX: x, clientY: y, pointerId } = event;
    const timer = touch
      ? window.setTimeout(() => {
          if (pending.current?.cardId !== cardId) return;
          pending.current = null;
          navigator.vibrate?.(15);
          startDrag(cardId, x, y);
        }, TOUCH_HOLD_MS)
      : null;
    pending.current = { cardId, x, y, pointerId, touch, timer };
  };

  const dragged = drag ? byId.get(drag.cardId) : undefined;

  return (
    <div
      className={`hand${drag ? " hand-dragging" : ""}`}
      role="group"
      aria-label={t("table.hand")}
      ref={containerRef}
      // The phone layout fans the whole hand into one row and needs to know how many cards and groups there are.
      style={{ "--hand-count": cards.length, "--hand-groups": layout.length } as CSSProperties}
    >
      {layout.map((group, index) => {
        const plan = plans?.[index];
        // A lone, unarranged hand is not a plan, so it gets no verdict.
        const judged = plan !== undefined && (layout.length > 1 || plan.valid);
        const showValue = judged && plan.valid;
        const showDiscard = plan !== undefined && plan.pointsWithDiscard !== null && !!discardLabel;
        // Groups that are not melds stay unmarked: a pile of leftovers is normal and needs no cross.
        const captioned = showValue || showDiscard;
        return (
        <div className={`hand-group${captioned ? " hand-group-valued" : ""}${showValue ? " hand-group-ready" : ""}`} key={group[0]} role="group" aria-label={t("hand.group", { number: index + 1 })}>
          {group.map((id) => {
            const card = byId.get(id);
            if (!card) return null;
            const isTarget = drag?.target?.kind === "card" && drag.target.cardId === id;
            const dropClass = isTarget && drag?.target?.kind === "card" ? (drag.target.after ? " drop-after" : " drop-before") : "";
            return (
              <span
                key={id}
                data-card-id={id}
                className={`hand-slot${drag?.cardId === id ? " hand-slot-dragged" : ""}${dropClass}`}
                onPointerDown={(event) => onPointerDown(id, event)}
                onContextMenu={(event) => event.preventDefault()}
              >
                <CardView
                  card={card}
                  selected={selected.includes(id)}
                  badge={badgeFor(card)}
                  onClick={() => {
                    if (!suppressClick.current) onToggle(id);
                  }}
                />
              </span>
            );
          })}
          {/*
           * The bar under a ready group becomes its button: it is already sized to the part
           * of the group the next group does not cover, so it cannot overhang its neighbour.
           */}
          {showValue && plan && onPlayGroup && (
            <button type="button" className="hand-group-play" onClick={() => onPlayGroup(index)} aria-label={t("action.playGroup")}>
              <span className="value-go">{t("action.playShort")}</span> {plan.points}
            </button>
          )}
          {captioned && plan && (
            <span className="hand-group-value">
              {/* The button carries the points, so the plain verdict is only for a hand you cannot play from yet. */}
              {showValue && !onPlayGroup && (
                <span className="value-ready">
                  ✓ <span className="value-type">{plan.type === "set" ? t("table.set") : t("table.run")} · </span>
                  {plan.points}
                </span>
              )}
              {showDiscard && (
                <span className="value-discard">
                  +<bdi dir="ltr">{discardLabel}</bdi> → {plan.pointsWithDiscard}
                </span>
              )}
            </span>
          )}
        </div>
        );
      })}
      {drag && (
        <div className={`hand-newgroup${drag.target?.kind === "new-group" ? " hand-newgroup-active" : ""}`} data-new-group>
          {t("hand.newGroup")}
        </div>
      )}
      {drag && dragged && (
        <div className="hand-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <CardView card={dragged} />
        </div>
      )}
    </div>
  );
}
