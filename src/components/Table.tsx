import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card, JokerAssignments, Play, PublicRoomState, PublicSeat, TableMeld } from "../../shared/types.ts";
import { cardLabel, handPenalty, isJoker, refLabel } from "../../engine/cards.ts";
import { bestMeldGrouping } from "../../engine/bot.ts";
import { canReplaceJoker, interpretAddition, interpretNewMeld, legalDiscards, refOf } from "../../engine/melds.ts";
import type { MeldInterpretation } from "../../engine/melds.ts";
import { validatePlays } from "../../engine/plays.ts";
import type { PlayContext } from "../../engine/plays.ts";
import { groupCards, layoutBySuit, loadLayout, moveCard, normalizeLayout, saveLayout } from "../handLayout.ts";
import type { DropTarget, HandLayout } from "../handLayout.ts";
import { ltr, t } from "../i18n.ts";
import { planHand, valueOf } from "../meldPlanner.ts";
import { localName, serverText } from "../serverText.ts";
import type { Game } from "../net.ts";
import { playReactionSound, playSound } from "../prefs.ts";
import type { Prefs } from "../prefs.ts";
import { CardBack, CardView, cardName } from "./CardView.tsx";
import { Hand } from "./Hand.tsx";
import { ReactionIcon, ReactionMenuIcon, REACTION_DURATION_MS } from "./ReactionIcon.tsx";
import type { ReactionKind } from "./ReactionIcon.tsx";
import { REACTIONS, ReactionTray } from "./ReactionTray.tsx";

type ActiveReaction = { id: number; seat: number; kind: ReactionKind; source: "player" | "bot" };
const BOT_REACTION_COOLDOWN_MS = 24000;

/** Readings that differ only in which joker sits where are the same choice for the player. */
function distinctReadings(readings: MeldInterpretation[]): MeldInterpretation[] {
  const seen = new Set<string>();
  return readings.filter((reading) => {
    const key = `${reading.type}:${reading.cards.map((c) => refLabel(refOf(c))).join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function jokerAssignments(reading: MeldInterpretation, cardIds: readonly string[]): JokerAssignments {
  const result: JokerAssignments = {};
  for (const slot of reading.cards) {
    // Only run jokers carry a choice. A joker in a set has no fixed suit.
    const ref = slot.represents;
    if (ref && ref.suit !== null && cardIds.includes(slot.card.id)) result[slot.card.id] = { rank: ref.rank, suit: ref.suit };
  }
  return result;
}

interface JokerChoice {
  readings: MeldInterpretation[];
  cardIds: string[];
  onPick: (jokerAs: JokerAssignments) => void;
}

function SeatChip({ seat, room, leaderSeat, handValue, reaction }: { seat: PublicSeat; room: PublicRoomState; leaderSeat: number | null; handValue?: number; reaction?: ActiveReaction }) {
  const active = room.activeSeat === seat.seat;
  const isMe = seat.seat === room.viewer.seat;
  const name = localName(seat.name);
  return (
    <li className={`seat-chip${active ? " seat-active" : ""}${isMe ? " seat-me" : ""}${seat.kind === "bot" ? " seat-bot" : ""}`} aria-current={active ? "true" : undefined}>
      <div className="seat-chip-head">
        <span className={`seat-avatar avatar-portrait avatar-portrait-${seat.avatarId}`} aria-hidden="true" />
        {leaderSeat === seat.seat && (
          <span className="seat-award seat-award-crown" role="img" aria-label={t("table.leading")}>
            <svg viewBox="0 0 40 32" aria-hidden="true" focusable="false">
              <path d="M4 9 11 17 20 5 29 17 36 9 33 25H7Z" fill="#f8be4b" stroke="#764321" strokeWidth="2" strokeLinejoin="round" />
              <path d="M7 25h26v4H7z" fill="#e68e32" stroke="#764321" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="20" cy="19" r="2.5" fill="#fff2bb" />
              <circle cx="4" cy="8" r="2" fill="#ffe597" /><circle cx="20" cy="4" r="2" fill="#ffe597" /><circle cx="36" cy="8" r="2" fill="#ffe597" />
            </svg>
          </span>
        )}
        {seat.roundWinStreak >= 2 && (
          <span className="seat-award seat-award-fire" role="img" aria-label={t("table.winStreak", { count: seat.roundWinStreak })}>
            <svg viewBox="0 0 32 38" aria-hidden="true" focusable="false">
              <path className="seat-flame-outer" d="M17 2c2 7-1 9 1 13 4-2 5-5 5-8 9 9 9 16 4 23-5 7-17 8-23 0C0 24 4 18 9 14c0 5 2 6 4 7 3-5 1-11 4-19Z" fill="#e96b2c" stroke="#8a3d25" strokeWidth="1.5" strokeLinejoin="round" />
              <path className="seat-flame-inner" d="M17 18c1 4 6 7 4 12-2 5-9 5-12 0-2-4 2-9 5-11 0 3 1 4 3 5Z" fill="#ffd277" />
            </svg>
          </span>
        )}
        {reaction && (
          <span key={reaction.id} className={`seat-reaction seat-reaction-${reaction.kind}`} data-reaction-id={reaction.id} role="img" aria-label={t(REACTIONS.find((item) => item.kind === reaction.kind)!.label)}>
            <ReactionIcon kind={reaction.kind} />
          </span>
        )}
        <span className="seat-card-badge" aria-label={t("table.cards", { count: seat.cardCount })}>
          <span aria-hidden="true"><CardBack small /></span>
          <strong>{seat.cardCount}</strong>
        </span>
      </div>
      <div className="seat-chip-copy">
        <div className="seat-chip-name">
          {active && <span className="turn-marker" aria-hidden="true">▶</span>}
          <strong>{name}</strong>
          {isMe && <span className="tag tag-you">{t("lobby.you")}</span>}
          {seat.kind === "bot" && <span className="tag">{t("lobby.bot")}</span>}
          {room.dealerSeat === seat.seat && <span className="tag">{t("table.dealer")}</span>}
        </div>
        <div className="seat-chip-info">
          <span className="seat-score">{t("table.score", { score: seat.score })}</span>
          {handValue !== undefined && (
            <span className="seat-hand-value">
              <span className="label-long">{t("planner.handValue", { points: handValue })}</span>
              <span className="label-short">{t("planner.handShort", { points: handValue })}</span>
            </span>
          )}
        </div>
      </div>
      {(seat.kind === "human" && !seat.connected || seat.botControlled || seat.reservedFor) && (
        <div className="seat-chip-tags">
          {seat.kind === "human" && !seat.connected && <span className="tag tag-warn">⚠ {t("table.offline")}</span>}
          {seat.botControlled && <span className="tag tag-warn">{t("table.botPlaying")}</span>}
          {seat.reservedFor && <span className="tag">{t("table.reserved", { name: seat.reservedFor })}</span>}
        </div>
      )}
    </li>
  );
}

/** What the currently selected cards would be worth as a new meld. */
function SelectionValue({ cards }: { cards: readonly Card[] }) {
  const value = valueOf(cards);
  if (value.valid) {
    return (
      <li className="planner-good">
        ✓ {t("planner.selected", { type: value.type === "set" ? t("table.set") : t("table.run"), points: value.points })}
      </li>
    );
  }
  return (
    <li className="planner-bad">
      ✗ {t("planner.selectedInvalid")}
      {value.reason ? ` ${serverText(value.reason)}` : ""}
    </li>
  );
}

export function Table({ game, room, prefs, tipsOpen, onHideTips, reactionsBlocked = false }: { game: Game; room: PublicRoomState; prefs: Prefs; tipsOpen: boolean; onHideTips: () => void; reactionsBlocked?: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [taking, setTaking] = useState(false);
  const [staged, setStaged] = useState<Play[]>([]);
  // Each round deals a new hand, so each round gets its own arrangement.
  const layoutKey = `romino-hand-${room.code}-${room.roundNumber}`;
  const [savedLayout, setSavedLayout] = useState<HandLayout>(() => loadLayout(layoutKey));
  useEffect(() => setSavedLayout(loadLayout(layoutKey)), [layoutKey]);
  // A finished match clears its arrangements, so a rematch in the same room starts clean.
  useEffect(() => {
    if (room.status !== "match-end") return;
    for (let round = 1; round <= room.roundNumber; round++) saveLayout(`romino-hand-${room.code}-${round}`, []);
    setSavedLayout([]);
  }, [room.status, room.code, room.roundNumber]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [visibleWarning, setVisibleWarning] = useState<string | null>(null);
  const [jokerChoice, setJokerChoice] = useState<JokerChoice | null>(null);
  // Adding a card to a set that holds a joker can mean two things, so the player is asked which one.
  const [swapChoice, setSwapChoice] = useState<{ meld: TableMeld; jokerId: string; cardId: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortControl = useRef<HTMLDivElement>(null);
  const sortTrigger = useRef<HTMLButtonElement>(null);
  const [reaction, setReaction] = useState<ActiveReaction | null>(null);
  const reactionRef = useRef<ActiveReaction | null>(null);
  const reactionId = useRef(0);
  const reactionTimer = useRef<number | null>(null);
  const reactionSound = useRef<(() => void) | null>(null);
  const reactionTrigger = useRef<HTMLButtonElement>(null);
  const lastBotReaction = useRef(-Infinity);
  const botsBlockedRef = useRef(false);
  const lastMeldCount = useRef(room.melds.length);
  const seatsRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!sortControl.current?.contains(event.target as Node)) setSortOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [sortOpen]);

  const mySeat = room.viewer.seat;
  const me = mySeat !== null ? room.seats[mySeat] : null;
  const playing = room.status === "playing";
  const myTurn = playing && mySeat !== null && room.activeSeat === mySeat;
  const opened = me?.opened ?? false;
  const activeName = room.activeSeat !== null ? localName(room.seats[room.activeSeat].name) : "";
  const botSeats = room.seats.filter((seat) => seat.kind === "bot" || seat.botControlled).map((seat) => seat.seat);
  const botSeatsKey = botSeats.join(",");

  const botsBlocked = !playing || !prefs.botReactions || reactionsOpen || tipsOpen || reactionsBlocked || busy || !!visibleWarning || !!jokerChoice || !!swapChoice;
  useEffect(() => { botsBlockedRef.current = botsBlocked; }, [botsBlocked]);

  const clearReaction = useCallback(() => {
    if (reactionTimer.current !== null) window.clearTimeout(reactionTimer.current);
    reactionTimer.current = null;
    reactionSound.current?.();
    reactionSound.current = null;
    reactionRef.current = null;
    setReaction(null);
  }, []);

  const showReaction = useCallback((seat: number, kind: ReactionKind, source: ActiveReaction["source"]) => {
    const now = performance.now();
    // Check again at dispatch: a player may have reacted since a bot's timer was scheduled.
    if (source === "bot" && (botsBlockedRef.current || reactionRef.current || now - lastBotReaction.current < BOT_REACTION_COOLDOWN_MS)) return;
    clearReaction();
    const next = { id: ++reactionId.current, seat, kind, source };
    reactionRef.current = next;
    setReaction(next);
    if (source === "bot") lastBotReaction.current = now;
    reactionTimer.current = window.setTimeout(clearReaction, REACTION_DURATION_MS);
  }, [clearReaction]);

  const closeReactions = useCallback((restoreFocus = false) => {
    setReactionsOpen(false);
    if (restoreFocus) reactionTrigger.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (tipsOpen || reactionsBlocked || visibleWarning || jokerChoice || swapChoice) {
      setReactionsOpen(false);
      clearReaction();
    }
  }, [tipsOpen, reactionsBlocked, visibleWarning, jokerChoice, swapChoice, clearReaction]);

  useEffect(() => {
    if (!prefs.sound) { reactionSound.current?.(); reactionSound.current = null; }
    if (!prefs.botReactions && reactionRef.current?.source === "bot") clearReaction();
  }, [prefs.sound, prefs.botReactions, clearReaction]);

  useEffect(() => () => {
    if (reactionTimer.current !== null) window.clearTimeout(reactionTimer.current);
    reactionSound.current?.();
  }, []);

  useEffect(() => {
    setReactionsOpen(false);
    clearReaction();
    lastBotReaction.current = -Infinity;
  }, [room.code, room.roundNumber, room.status, clearReaction]);

  // Solo café regulars react only occasionally; their bubbles never enter match state or the log.
  useEffect(() => {
    if (botsBlocked || reaction || botSeats.length === 0) return;
    const timer = window.setTimeout(() => {
      const seat = botSeats[Math.floor(Math.random() * botSeats.length)];
      const kind: ReactionKind = Math.random() < 0.5 ? "tea" : "coffee";
      showReaction(seat, kind, "bot");
    }, 24000 + Math.random() * 16000);
    return () => window.clearTimeout(timer);
  }, [room.code, room.roundNumber, botsBlocked, botSeatsKey, reaction, showReaction]);

  useEffect(() => {
    const playedNewMeld = room.melds.length > lastMeldCount.current;
    lastMeldCount.current = room.melds.length;
    if (!playedNewMeld || !myTurn || botsBlocked || reaction || botSeats.length === 0 || Math.random() >= 0.3) return;
    const timer = window.setTimeout(() => {
      showReaction(botSeats[Math.floor(Math.random() * botSeats.length)], "bravo", "bot");
    }, 550);
    return () => window.clearTimeout(timer);
  }, [room.melds.length, room.roundNumber, myTurn, botsBlocked, botSeatsKey, reaction, showReaction]);

  const chooseReaction = (kind: ReactionKind) => {
    if (mySeat === null) return;
    closeReactions(true);
    showReaction(mySeat, kind, "player");
    reactionSound.current = playReactionSound(kind, prefs.sound);
  };

  // Leave staging whenever the turn, phase, or round moves on.
  useEffect(() => {
    setTaking(false);
    setSortOpen(false);
    setStaged([]);
    setSelected([]);
    setLocalError(null);
    setJokerChoice(null);
    setSwapChoice(null);
  }, [room.activeSeat, room.turnPhase, room.roundNumber, room.status]);

  // On a phone the seats form a strip that scrolls sideways, so keep the active player in view.
  useEffect(() => {
    const strip = seatsRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    // Your own chip is pinned to the edge, so never scroll it out of the way for itself.
    const active = strip.querySelector<HTMLElement>(".seat-active:not(.seat-me)");
    if (active) strip.scrollTo({ left: active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2, behavior: "smooth" });
  }, [room.activeSeat]);

  // Sounds: your turn, table activity, end of round.
  const wasMyTurn = useRef(false);
  const lastLogLength = useRef(room.log.length);
  const lastStatus = useRef(room.status);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) playSound("turn", prefs.sound);
    else if (room.log.length !== lastLogLength.current && playing) playSound("card", prefs.sound);
    if (room.status !== lastStatus.current && (room.status === "round-end" || room.status === "match-end")) playSound("win", prefs.sound);
    wasMyTurn.current = myTurn;
    lastLogLength.current = room.log.length;
    lastStatus.current = room.status;
  }, [myTurn, playing, prefs.sound, room.log.length, room.status]);

  const context: PlayContext | null = useMemo(() => {
    if (mySeat === null || !myTurn) return null;
    if (taking && room.topDiscard) {
      return {
        seat: mySeat,
        hand: [...room.hand, room.topDiscard],
        melds: room.melds,
        opened,
        settings: room.settings,
        mode: "take-discard",
        requiredCardId: room.topDiscard.id,
        nextMeldId: room.nextMeldId,
      };
    }
    if (room.turnPhase !== "play") return null;
    return {
      seat: mySeat,
      hand: room.hand,
      melds: room.melds,
      opened,
      settings: room.settings,
      mode: room.cardSource === "stock" ? "after-stock" : "after-discard",
      requiredCardId: null,
      nextMeldId: room.nextMeldId,
    };
  }, [mySeat, myTurn, taking, room.topDiscard, room.hand, room.melds, room.settings, room.nextMeldId, room.turnPhase, room.cardSource, opened]);

  const preview = useMemo(() => (taking && context ? validatePlays(context, staged, { partial: true }) : null), [taking, context, staged]);
  const finalCheck = useMemo(() => (taking && context && staged.length > 0 ? validatePlays(context, staged) : null), [taking, context, staged]);

  const visibleHand = preview?.ok ? preview.hand : room.hand;
  const visibleMelds = preview?.ok ? preview.melds : room.melds;
  // The arrangement is a personal view of the hand. It is kept per room and survives a reload.
  const layout = useMemo(() => normalizeLayout(savedLayout, visibleHand.map((c) => c.id)), [savedLayout, visibleHand]);
  const orderedHand = useMemo(() => {
    const byId = new Map(visibleHand.map((c) => [c.id, c]));
    return layout.flat().flatMap((id) => byId.get(id) ?? []);
  }, [layout, visibleHand]);
  const arrange = (next: HandLayout) => {
    setSavedLayout(next);
    saveLayout(layoutKey, next);
  };
  const moveInHand = (cardId: string, target: DropTarget) => arrange(moveCard(layout, cardId, target));

  // The meld calculator. The face-up discard only counts while the player could actually take it.
  const discardInReach = myTurn && room.turnPhase === "draw" && !taking ? room.topDiscard : null;
  const plan = useMemo(() => {
    const byId = new Map(visibleHand.map((c) => [c.id, c]));
    return planHand(layout.map((group) => group.flatMap((id) => byId.get(id) ?? [])), discardInReach);
  }, [layout, visibleHand, discardInReach]);
  const needsOpening = !opened && room.settings.openingRequired;
  const openingNeeded = room.settings.openingThreshold;
  const selectedCards = orderedHand.filter((c) => selected.includes(c.id));
  // A lone joker is discarded to go out. Two or more jokers and nothing else cannot be discarded, so the turn is passed.
  const onlyJokers = room.hand.length > 1 && room.hand.every(isJoker);

  const canPlayNow = context !== null && (taking || opened || room.cardSource === "discard");
  // New melds need an opened player, except in the discard take that does the opening.
  const canNewMeld = context !== null && (taking || opened) && selectedCards.length >= 3;
  const wantsDiscard = myTurn && !taking && room.turnPhase === "play" && selectedCards.length === 1 && (!isJoker(selectedCards[0]) || room.hand.length === 1);
  // A card that fits a meld on the table may not be thrown away.
  const discardBlocked = wantsDiscard && !legalDiscards(room.hand, room.melds).some((c) => c.id === selectedCards[0].id);
  const canDiscard = wantsDiscard && !discardBlocked;

  const toggle = (id: string) => {
    setLocalError(null);
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };

  const fail = (message: string) => {
    setLocalError(message);
    playSound("error", prefs.sound);
  };

  /** Stages the play while taking the discard. Otherwise sends it straight to the server. */
  const submitPlay = async (play: Play) => {
    if (!context) return;
    if (taking) {
      const check = validatePlays(context, [...staged, play], { partial: true });
      if (!check.ok) return fail(check.error);
      setStaged((current) => [...current, play]);
      setSelected([]);
      setLocalError(null);
      return;
    }
    setBusy(true);
    const accepted = await game.act({ type: "PLAY", plays: [play] });
    setBusy(false);
    if (accepted) setSelected([]);
    else playSound("error", prefs.sound);
  };

  /** Asks the player what an ambiguous joker stands for before building the play. */
  const withJokerChoice = (readings: MeldInterpretation[], cardIds: string[], build: (jokerAs: JokerAssignments | undefined) => Play) => {
    const options = distinctReadings(readings);
    if (options.length <= 1) {
      void submitPlay(build(options[0] ? jokerAssignments(options[0], cardIds) : undefined));
      return;
    }
    setJokerChoice({
      readings: options,
      cardIds,
      onPick: (jokerAs) => {
        setJokerChoice(null);
        void submitPlay(build(jokerAs));
      },
    });
  };

  /** Phase 2: a group that is already a legal meld is played with one tap on its label. */
  const playGroup = (index: number) => {
    const byId = new Map(visibleHand.map((c) => [c.id, c]));
    const group = layout[index].flatMap((id) => byId.get(id) ?? []);
    if (group.length < 3) return;
    const cardIds = group.map((c) => c.id);
    withJokerChoice(interpretNewMeld(group), cardIds, (jokerAs) => ({ kind: "new-meld", cardIds, jokerAs }));
  };

  const newMeld = () => {
    const cardIds = selectedCards.map((c) => c.id);
    const readings = interpretNewMeld(selectedCards);
    if (readings.length === 0) {
      void submitPlay({ kind: "new-meld", cardIds });
      return;
    }
    withJokerChoice(readings, cardIds, (jokerAs) => ({ kind: "new-meld", cardIds, jokerAs }));
  };

  const addPlain = (meld: TableMeld) => {
    const cardIds = selectedCards.map((c) => c.id);
    withJokerChoice(interpretAddition(meld, selectedCards), cardIds, (jokerAs) => ({ kind: "add", meldId: meld.id, cardIds, jokerAs }));
  };

  const addTo = (meld: TableMeld) => {
    const cardIds = selectedCards.map((c) => c.id);
    // A single card that fits a joker's place could either join the set or take the joker. Let the player choose.
    if (meld.type === "set" && selectedCards.length === 1) {
      const card = selectedCards[0];
      const joker = meld.cards.find((slot) => canReplaceJoker(meld, slot.card.id, card));
      if (joker) {
        setSwapChoice({ meld, jokerId: joker.card.id, cardId: card.id, label: ltr(cardLabel(card)) });
        return;
      }
    }
    withJokerChoice(interpretAddition(meld, selectedCards), cardIds, (jokerAs) => ({ kind: "add", meldId: meld.id, cardIds, jokerAs }));
  };

  const act = async (action: Parameters<Game["act"]>[0]) => {
    setBusy(true);
    const accepted = await game.act(action);
    setBusy(false);
    if (accepted) setSelected([]);
    else playSound("error", prefs.sound);
  };

  const startTaking = () => {
    if (!room.topDiscard) return;
    game.clearError();
    setTaking(true);
    setStaged([]);
    setSelected([room.topDiscard.id]);
  };

  const cancelTaking = () => {
    setTaking(false);
    setStaged([]);
    setSelected([]);
    setLocalError(null);
  };

  const confirmTaking = async () => {
    if (!finalCheck?.ok) return;
    await act({ type: "TAKE_DISCARD_AND_PLAY", plays: staged });
  };

  // A signpost, not a paragraph. The full explanation moves behind the help button.
  let status: string;
  let why: string | null = null;
  if (!playing) status = "";
  else if (room.viewer.waiting) status = t("table.waiting");
  else if (!myTurn) status = t("turn.other", { name: activeName });
  else if (taking) {
    status = t("turn.shortTaking");
    why = room.topDiscard ? t("turn.taking", { card: ltr(cardLabel(room.topDiscard)) }) : null;
  } else if (room.turnPhase === "draw") {
    status = t("turn.shortDraw");
    why = opened || !room.settings.openingRequired ? t("turn.draw") : t("turn.drawUnopened", { points: room.settings.openingThreshold });
  } else if (onlyJokers) {
    status = t("turn.shortPass");
    why = t("turn.onlyJokers");
  } else {
    status = t("turn.shortDiscard");
    why = room.cardSource === "stock" ? (opened ? t("turn.afterStock") : t("turn.afterStockUnopened")) : t("turn.afterDiscard");
  }

  const canDraw = myTurn && room.turnPhase === "draw" && !taking && !busy;
  const stockBlocked = room.stockCount === 0 && room.discardCount <= 1;
  const others = room.seats.filter((s) => s.seat !== mySeat);
  const clockwise = mySeat === null ? others : [...others.filter((s) => s.seat > mySeat), ...others.filter((s) => s.seat < mySeat)];
  const signature = (m: TableMeld) => m.cards.map((c) => c.card.id).join(",");
  const pendingMeldIds = new Set(visibleMelds.filter((m) => !room.melds.some((r) => r.id === m.id && signature(r) === signature(m))).map((m) => m.id));
  const error = localError ?? game.error;
  const logEntries = room.log.filter((line) => line.trim().length > 0).slice(-12);
  const warningMessage = error
    ? serverText(error)
    : discardBlocked
      ? t("turn.discardBlocked", { card: ltr(cardLabel(selectedCards[0])) })
      : null;
  useEffect(() => setVisibleWarning(warningMessage), [warningMessage]);
  useEffect(() => {
    if (!visibleWarning) return;
    const timer = window.setTimeout(() => {
      setVisibleWarning(null);
      setLocalError(null);
      game.clearError();
    }, 5500);
    return () => window.clearTimeout(timer);
  }, [visibleWarning, game.clearError]);
  const dismissWarning = () => {
    setVisibleWarning(null);
    setLocalError(null);
    game.clearError();
  };
  const showOpening = taking && !opened;
  const openingProgress = showOpening && preview?.ok ? preview.openingPoints : plan.readyPoints;
  const openingPercent = Math.min(100, Math.max(0, (openingProgress / Math.max(1, openingNeeded)) * 100));
  // Tapping the felt plays the selection, so the offer only appears when that selection is a real meld.
  const selectionMeld = canNewMeld ? interpretNewMeld(selectedCards)[0] : undefined;
  const gameLog = logEntries.length > 0 && (
    <details className="log">
      <summary>{t("table.log")}</summary>
      <ol aria-live="polite">
        {logEntries.map((line, i) => (
          <li key={`${room.log.length - i}-${line}`}>{serverText(line)}</li>
        ))}
      </ol>
    </details>
  );

  const lowestScore = Math.min(...room.seats.map((seat) => seat.score));
  const leaders = room.seats.filter((seat) => seat.score === lowestScore);
  const leaderSeat = (room.roundNumber > 1 || room.status !== "playing") && leaders.length === 1 ? leaders[0].seat : null;

  return (
    <div className="table">
      <ul className="seats" aria-label={t("lobby.seats")} ref={seatsRef}>
        {mySeat !== null && me && <SeatChip seat={me} room={room} leaderSeat={leaderSeat} handValue={playing ? handPenalty(room.hand) : undefined} reaction={reaction?.seat === mySeat ? reaction : undefined} />}
        {clockwise.map((seat) => (
          <SeatChip key={seat.seat} seat={seat} room={room} leaderSeat={leaderSeat} reaction={reaction?.seat === seat.seat ? reaction : undefined} />
        ))}
      </ul>

      <div className="round-plaque" aria-label={room.tiebreak ? t("table.tiebreak", { number: room.roundNumber }) : t("table.round", { number: room.roundNumber })}>
        <span aria-hidden="true">✦</span>
        <strong>{room.tiebreak ? t("table.tiebreak", { number: room.roundNumber }) : t("table.round", { number: room.roundNumber })}</strong>
        <span aria-hidden="true">✦</span>
      </div>

      <section className="felt">
        <div className="piles">
          <div className="pile">
            <button
              type="button"
              className="pile-button"
              disabled={!canDraw}
              onClick={() => void act({ type: "DRAW_FROM_STOCK" })}
              aria-label={`${t("action.drawStock")}. ${t("table.stockCount", { count: room.stockCount })}`}
            >
              {room.stockCount > 0 ? <CardBack /> : <span className="card card-empty">{t("table.discardEmpty")}</span>}
            </button>
            <span className="pile-count" aria-hidden="true">{room.stockCount}</span>
            <span className="pile-label">
              {t("table.stock")}
            </span>
            {canDraw && <span className="pile-hint">{t("action.drawStock")}</span>}
          </div>

          <div className={`pile${canDiscard ? " pile-throw" : ""}`}>
            {canDiscard ? (
              <button
                type="button"
                className="pile-button"
                disabled={busy}
                onClick={() => void act({ type: "DISCARD_CARD", cardId: selectedCards[0].id })}
                aria-label={t("action.throwHere", { card: cardName(selectedCards[0]) })}
              >
                {room.topDiscard ? <CardView card={room.topDiscard} /> : <span className="card card-empty" />}
              </button>
            ) : room.topDiscard && !taking ? (
              <CardView card={room.topDiscard} onClick={canDraw ? startTaking : undefined} actionLabel={canDraw ? t("action.takeDiscard") : undefined} />
            ) : (
              <span className="card card-empty">{taking ? "" : t("table.discardEmpty")}</span>
            )}
            <span className="pile-label">{t("table.discard")}</span>
            {canDiscard && <span className="pile-hint pile-hint-throw">{t("action.discard")} {ltr(cardLabel(selectedCards[0]))}</span>}
            {canDraw && room.topDiscard && <span className="pile-hint">{t("action.takeDiscard")}</span>}
          </div>
        </div>

        <div className="melds" aria-label={t("table.melds")}>
          {visibleMelds.length === 0 && !selectionMeld && <p className="note">{t("table.noMelds")}</p>}
          {visibleMelds.map((meld) => {
            const pending = pendingMeldIds.has(meld.id);
            // The taken discard must go into a new meld, so it is never offered as an addition.
            const holdsTaken = taking && selectedCards.some((c) => c.id === room.topDiscard?.id);
            const addable = canPlayNow && !holdsTaken && selectedCards.length > 0 && interpretAddition(meld, selectedCards).length > 0;
            return (
              <div key={meld.id} className={`meld${pending ? " meld-pending" : ""}${addable ? " meld-target" : ""}`}>
                <div className="meld-label">
                  <span>{meld.type === "set" ? t("table.set") : t("table.run")}</span>
                  <span>{t("table.owner", { name: localName(room.seats[meld.ownerSeat]?.name ?? "") })}</span>
                  {pending && <span className="tag tag-warn">{t("table.pending")}</span>}
                </div>
                <div className="meld-cards">
                  {meld.cards.map((slot) => {
                    const single = selectedCards.length === 1 ? selectedCards[0] : null;
                    const swappable = canPlayNow && single !== null && !(taking && single.id === room.topDiscard?.id) && canReplaceJoker(meld, slot.card.id, single);
                    return (
                      <CardView
                        key={slot.card.id}
                        card={slot.card}
                        represents={slot.represents}
                        small
                        badge={taking && room.topDiscard?.id === slot.card.id ? t("table.mustUse") : swappable ? t("table.swap") : null}
                        onClick={swappable ? () => void submitPlay({ kind: "replace-joker", meldId: meld.id, jokerId: slot.card.id, cardId: selectedCards[0].id }) : undefined}
                        actionLabel={swappable ? t("action.replaceJoker") : undefined}
                      />
                    );
                  })}
                </div>
                {addable && (
                  <button type="button" className="button button-small meld-add" disabled={busy} onClick={() => addTo(meld)} aria-label={t("action.addHere")}>
                    + {selectedCards.map(cardLabel).join(" ")}
                  </button>
                )}
              </div>
            );
          })}
          {selectionMeld && (
            <button type="button" className="meld-drop" disabled={busy} onClick={newMeld}>
              <span className="meld-drop-title">+ {t("action.playHere")}</span>
              <span className="meld-drop-cards">{selectedCards.map((c) => ltr(cardLabel(c))).join(" ")}</span>
              <span className="meld-drop-points">{selectionMeld.type === "set" ? t("table.set") : t("table.run")} · {selectionMeld.points}</span>
            </button>
          )}
        </div>
      </section>

      <section className={`controls${tipsOpen ? " tips-open" : ""}`} aria-label={t("table.hand")}>
        <div className={`turn-cue${reactionsOpen ? " turn-cue-picker-open" : ""}`}>
          <div className="turn-cue-content" aria-hidden={reactionsOpen || undefined}>
        {mySeat !== null && playing && needsOpening && (
          <div className="opening-meter" role="progressbar" aria-label={t("opening.total", { points: openingProgress, needed: openingNeeded })} aria-valuemin={0} aria-valuemax={openingNeeded} aria-valuenow={Math.min(openingNeeded, openingProgress)}>
            <strong dir="ltr">{openingProgress} / {openingNeeded}</strong>
            <span className="opening-meter-track" aria-hidden="true"><span style={{ width: `${openingPercent}%` }} /></span>
          </div>
        )}
        <p className={`status${myTurn ? " status-mine" : ""}`} role="status" aria-live="polite">
          {status}
        </p>
          </div>
          {reactionsOpen && <ReactionTray triggerRef={reactionTrigger} onChoose={chooseReaction} onClose={closeReactions} />}
        </div>
        {myTurn && room.turnPhase === "draw" && !taking && stockBlocked && <p className="note">{t("turn.stockEmpty")}</p>}

        {mySeat !== null && me && playing && (
          <ul className="planner" aria-label={t("planner.title")}>
            {playing && needsOpening && !taking && plan.pointsWithDiscard !== null && discardInReach && (
              <li className={plan.pointsWithDiscard >= openingNeeded ? "planner-good" : "planner-warn"}>
                {plan.pointsWithDiscard >= openingNeeded ? "✓ " : ""}
                {t("planner.withDiscard", { card: ltr(cardLabel(discardInReach)), points: plan.pointsWithDiscard, needed: openingNeeded })}
              </li>
            )}
            {playing && selectedCards.length >= 3 && <SelectionValue cards={selectedCards} />}
          </ul>
        )}

        {showOpening && preview?.ok && (!room.settings.openingRequired || preview.openingPoints >= room.settings.openingThreshold) && (
          <p className="opening" role="status">
            {room.settings.openingRequired ? `✓ ${t("opening.reached")}` : t("opening.free")}
          </p>
        )}

        {taking && finalCheck && !finalCheck.ok && !error && <p className="note">{serverText(finalCheck.error)}</p>}

        {mySeat !== null && (
          <>
            <Hand
              cards={visibleHand}
              layout={layout}
              selected={selected}
              badgeFor={(card) => (taking && card.id === room.topDiscard?.id ? t("table.mustUse") : card.id === room.drawnCardId ? t("table.justDrawn") : null)}
              onToggle={toggle}
              onMove={moveInHand}
              plans={playing ? plan.groups : undefined}
              onPlayGroup={canNewMeld || (context !== null && (taking || opened)) ? playGroup : undefined}
              discardLabel={discardInReach ? cardLabel(discardInReach) : null}
            />

            <div className="actions action-dock">
              <div className="sort-control" ref={sortControl} onKeyDown={(event) => {
                if (event.key === "Escape") { setSortOpen(false); sortTrigger.current?.focus(); }
              }}>
                <button
                  ref={sortTrigger}
                  type="button"
                  className="button button-small button-sort action-sort"
                  aria-expanded={sortOpen}
                  aria-controls="sort-options"
                  onClick={() => setSortOpen((open) => !open)}
                  title={t("action.sortHint")}
                >
                  ↕ {t("action.sort")}
                </button>
                {sortOpen && (
                  <div id="sort-options" className="sort-options" role="group" aria-label={t("action.sortHint")}>
                    <button type="button" onClick={() => { arrange(layoutBySuit(visibleHand)); setSortOpen(false); sortTrigger.current?.focus(); }}>
                      {t("action.sortSuitAscending")}
                    </button>
                    <button type="button" onClick={() => { arrange(bestMeldGrouping(visibleHand).map((group) => group.map((c) => c.id))); setSortOpen(false); sortTrigger.current?.focus(); }}>
                      {t("action.sortMelds")}
                    </button>
                  </div>
                )}
              </div>
              {taking ? (
                <button type="button" className="button button-primary action-main" disabled={!finalCheck?.ok || busy} onClick={() => void confirmTaking()}>
                  {t("action.confirm")}
                </button>
              ) : canDraw && room.topDiscard ? (
                <button type="button" className="button button-primary action-main" onClick={startTaking}>
                  {t("action.takeDiscard")}
                </button>
              ) : canDraw ? (
                <button type="button" className="button button-primary action-main" onClick={() => void act({ type: "DRAW_FROM_STOCK" })}>
                  {t("action.drawStock")}
                </button>
              ) : canDiscard ? (
                <button type="button" className="button button-primary action-main" disabled={busy} onClick={() => void act({ type: "DISCARD_CARD", cardId: selectedCards[0].id })}>
                  {t("action.discard")} {ltr(cardLabel(selectedCards[0]))}
                </button>
              ) : selectionMeld ? (
                <button type="button" className="button button-primary action-main" disabled={busy} onClick={newMeld}>
                  {t("action.playHere")}
                </button>
              ) : myTurn && onlyJokers ? (
                <button type="button" className="button button-primary action-main" disabled={busy} onClick={() => void act({ type: "PASS_TURN" })}>
                  {t("action.pass")}
                </button>
              ) : myTurn && room.turnPhase === "play" ? (
                <button type="button" className="button button-primary action-main" disabled>
                  {t("action.discard")}
                </button>
              ) : (
                <span className="action-main-placeholder" aria-hidden="true" />
              )}
              <button ref={reactionTrigger} type="button" className={`button button-small action-help reaction-dock-trigger${reaction?.seat === mySeat ? " reaction-dock-active" : ""}`} aria-expanded={reactionsOpen} aria-controls={reactionsOpen ? "reaction-tray" : undefined} aria-label={t(reactionsOpen ? "reaction.close" : "reaction.open")} onClick={() => { onHideTips(); setReactionsOpen((open) => !open); }}>
                {reaction?.seat === mySeat ? <ReactionIcon kind={reaction.kind} /> : <ReactionMenuIcon />}
              </button>
            </div>
            {(taking || selected.length > 0) && (
              <div className="arrange action-secondary" role="toolbar" aria-label={t("hand.arrange")}>
                {staged.length > 0 && (
                  <button type="button" className="button button-small" onClick={() => setStaged((current) => current.slice(0, -1))}>
                    {t("action.undo")}
                  </button>
                )}
                {taking && (
                  <button type="button" className="button button-small" onClick={cancelTaking}>
                    {t("action.cancel")}
                  </button>
                )}
                {selectedCards.length > 0 && (
                  <button type="button" className="button button-small" onClick={() => arrange(groupCards(layout, selected))}>
                    <span className="label-long">{t("hand.groupSelected")}</span>
                    <span className="label-short">{t("hand.groupShort")}</span>
                  </button>
                )}
                {selected.length > 0 && (
                  <button type="button" className="button button-small action-clear" onClick={() => setSelected([])}>
                    {t("action.clear")}
                  </button>
                )}
              </div>
            )}
            <div className="table-help" id="table-help" hidden={!tipsOpen}>
              {why && <p>{why}</p>}
              {myTurn && room.turnPhase === "draw" && !taking && room.topDiscard && <p>{t("action.takeWarning")}</p>}
              <p>{t("hand.hint")}</p>
              {canPlayNow && <p>{t("action.addHint")}</p>}
              {gameLog}
            </div>
          </>
        )}
      </section>

      {visibleWarning && (
        <div className="play-warning" role="alert" aria-atomic="true">
          <span className="play-warning-icon" aria-hidden="true">!</span>
          <div className="play-warning-copy">
            <strong>{t("warning.title")}</strong>
            <p>{visibleWarning}</p>
          </div>
          <button type="button" className="play-warning-close" onClick={dismissWarning} aria-label={t("warning.dismiss")}>×</button>
        </div>
      )}

      {mySeat === null && gameLog}

      {swapChoice && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="swap-title">
          <div className="panel">
            <h2 id="swap-title">{t("swap.title")}</h2>
            <div className="stack">
              <button
                type="button"
                className="button button-primary choice"
                onClick={() => {
                  const { meld, jokerId, cardId } = swapChoice;
                  setSwapChoice(null);
                  void submitPlay({ kind: "replace-joker", meldId: meld.id, jokerId, cardId });
                }}
              >
                <span>{t("swap.take")}</span>
                <span className="choice-cards choice-cards-dark">{t("swap.takeDetail", { card: swapChoice.label })}</span>
              </button>
              <button
                type="button"
                className="button choice"
                onClick={() => {
                  const { meld } = swapChoice;
                  setSwapChoice(null);
                  addPlain(meld);
                }}
              >
                <span>{t("swap.leave")}</span>
                <span className="choice-cards">{t("swap.leaveDetail", { card: swapChoice.label })}</span>
              </button>
              <button type="button" className="button button-quiet" onClick={() => setSwapChoice(null)}>
                {t("action.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {jokerChoice && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="joker-title">
          <div className="panel">
            <h2 id="joker-title">{t("joker.choose")}</h2>
            <div className="stack">
              {jokerChoice.readings.map((reading) => {
                const assignments = jokerAssignments(reading, jokerChoice.cardIds);
                const label = Object.values(assignments).map(refLabel).map(ltr).join(", ");
                return (
                  <button key={`${reading.type}-${reading.runStart}-${label}`} type="button" className="button choice" onClick={() => jokerChoice.onPick(assignments)}>
                    <span>{t("table.jokerAs", { card: label })}</span>
                    <span className="choice-cards">{reading.cards.map((c) => (c.represents ? `[${refLabel(c.represents)}]` : cardLabel(c.card))).join(" ")}</span>
                  </button>
                );
              })}
              <button type="button" className="button button-quiet" onClick={() => setJokerChoice(null)}>
                {t("action.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
