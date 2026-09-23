# Remino — Reaction Animation Plan

## Goal and scope

Make the four existing reactions feel like small moments at a Libyan café: expressive, recognizable on a phone, and brief enough that the cards remain the focus. This is a design and implementation plan, not an implementation. Reactions remain optional, visual-only expressions. They never affect turns, cards, scores, or the game log.

The four reactions are tea, coffee, hookah, and “حلوة!” (well played). No cigarette reaction is in this phase.

## What exists now

- A reaction button sits in the bottom action dock and opens a four-option tray.
- Selecting an option shows one reaction beside the sender's portrait for 2.2 seconds.
- The game allows one visible reaction at a time. The current artwork is simple SVG, with basic movement in CSS.
- Bots occasionally show tea or coffee and may respond “حلوة!” to a new meld. Bot reactions are client-side and do not enter match state.
- Sound, bot reactions, and reduced motion already have settings. All reactions currently use the same short electronic sound.

The work is therefore a focused visual-and-motion upgrade, not a new reaction system or a server feature.

## Visual direction

Use the generated café-object concepts as **art direction**, not as final tiny game assets. Their painterly detail will disappear at phone size. Redraw the final icons as layered, lightweight SVGs with a consistent silhouette, line weight, shadow, and limited palette:

- Deep teal for the tray and outlines; warm cream for the button surface.
- Amber for tea and gold highlights; white ceramic and dark brown for coffee.
- Turquoise and brass for the hookah; warm skin tones and small gold accents for the clap.
- No gradients, fine engraving, lettering, or decorative marks that become noise at 40–48 px.

The closed dock shows one compact reaction symbol. The open tray uses **four round buttons in one row**, with short labels underneath: `شاي`, `قهوة`, `أرجيلة`, `حلوة!` in Arabic. Keep labels available in English too. Each entire option is a touch target of at least 44 × 44 px. Do not animate idle icons; motion happens only after a reaction is chosen.

The active reaction appears beside the sender's portrait. It must not cover cards, scores, names, the stock/discard piles, or the main action button. Near a screen edge, the effect should grow inward or upward rather than be clipped.

## Shared animation language

Keep the existing **2.2-second total lifetime** so the visible reaction and cleanup timer stay aligned. All four reactions use the same broad rhythm:

| Time | Shared beat |
| --- | --- |
| 0–0.15 s | Appear beside the portrait with a restrained fade and scale from about 90% to 100%. |
| 0.15–1.2 s | Perform the reaction's one recognizable action. |
| 1.2–1.8 s | Settle; hold the recognizable final pose briefly. |
| 1.8–2.2 s | Fade away without travelling across the table. |

Use transforms and opacity for the outer bubble; animate only the relevant SVG layers inside it. Do not move the portrait or change table layout. Avoid loops, screen-wide particles, flashes, or a repeated bounce while the reaction is idle.

### Tea — `رشفة شاي`

1. **0–0.15 s:** Amber tea glass and saucer appear; a narrow steam curl is visible.
2. **0.15–0.55 s:** Glass tilts about 10° as if taking a sip. The saucer stays put.
3. **0.55–0.9 s:** Glass returns upright; two short steam curls rise and fade.
4. **0.9–1.2 s:** One subtle saucer-settle movement or thin ring; no splashing.
5. **1.2–2.2 s:** Hold, then fade with the shared exit.

Optional sound: one quiet glass-on-saucer clink, under 0.3 s.

### Coffee — `استراحة قهوة`

Use a small decorated **finjan**, not a generic large mug.

1. **0–0.15 s:** Cup appears, coffee surface still.
2. **0.15–0.45 s:** One small dark drop descends into the cup.
3. **0.45–0.9 s:** One or two concentric ripples expand within the cup and disappear.
4. **0.9–1.2 s:** Cup settles; a very light steam curl can rise once.
5. **1.2–2.2 s:** Hold, then fade.

Optional sound: a soft ceramic tap, not a loud pouring effect.

### Hookah — `نفخة أرجيلة`

1. **0–0.15 s:** Turquoise-and-brass hookah appears with a clear, compact silhouette.
2. **0.15–0.4 s:** Hose tip shifts slightly; base remains still.
3. **0.4–1.25 s:** A single soft, translucent puff rises beside the sender's portrait and thins out. It must never drift over another player or the cards.
4. **1.25–2.2 s:** Hookah stays still and fades.

Optional sound: one low, quiet bubbling note. No long exhale loop.

### Well played — `حلوة!`

1. **0–0.15 s:** Two friendly hands appear apart.
2. **0.15–0.45 s:** First light clap.
3. **0.45–0.8 s:** Hands part and clap a second time; two or three small gold marks appear at the contact point.
4. **0.8–1.2 s:** Hands relax; marks disappear.
5. **1.2–2.2 s:** Hold the readable hands pose, then fade.

Optional sound: two soft claps, both shorter and quieter than a card-play sound. No cheering voice or confetti.

## Tray and interaction behavior

1. Tapping the reaction button opens a compact tray above the dock in about 0.15 s. The main game controls must not jump vertically.
2. The tray stays still while open. Tapping a reaction closes it immediately and shows the chosen animation beside the player's portrait.
3. Tapping the reaction button again or outside the tray closes it without sending anything.
4. The tray should fit a narrow phone without covering the hand. If vertical room is tight, it can overlap the control area, but not the playing cards.
5. A player's new reaction may replace their previous reaction. Bot reactions must not interrupt a player reaction. Do not queue old reactions; drop them.

Keep reactions available outside the player's turn, as they are today. A reaction must never disable a card action or delay a turn.

## Bots and sound

Keep the existing occasional bot timing as the first baseline: ambient tea/coffee roughly every 24–40 seconds, plus an occasional “حلوة!” after a new meld. Add a simple cooldown so multiple bot effects cannot cluster. Suppress ambient bot reactions while the tray is open, during a warning/dialog, and during round transitions. A bot reaction may be skipped entirely rather than delayed.

Player-triggered reactions may play their own short sound when Sound is on. **Ambient bot reactions should be silent by default** to keep the café pleasant over a long match. Give each reaction one distinct sound, all at a lower volume than the turn and win cues. Use original or properly licensed audio only; synthesized effects are acceptable if they sound natural enough. The Sound toggle mutes all of them.

## Accessibility and comfort

- Respect both the game's Reduced motion setting and the device's `prefers-reduced-motion` preference.
- In reduced-motion mode, show the static final icon beside the portrait for a short moment, then remove it. No tilt, travel, ripple, puff, clap motion, or scaling entrance.
- Keep the reaction name as the accessible label for the tray button and active effect. Do not repeatedly announce ambient bot reactions to a screen reader.
- Give keyboard users visible focus and the same four choices. Do not rely on sound or movement alone to identify a reaction.
- Avoid flashing, rapid pulsing, or large smoke effects.

See the [W3C reduced-motion technique](https://www.w3.org/WAI/WCAG22/Techniques/css/C39) for the interaction-triggered motion principle.

## Production approach

1. **Asset pass:** Produce four consistent layered SVG icons, previewed at both 48 px and the smaller mobile portrait-bubble size. Separate only the parts that need motion: tea glass/steam, coffee drop/ripple, hookah hose/puff, and clap hands/marks. Approve static art before animating it.
2. **Motion pass:** Animate those SVG layers with short, deterministic keyframes. Keep a shared 2.2-second lifecycle and one active reaction. No GIF or video is needed for these small interface effects.
3. **Tray pass:** Apply the round-button design and short labels. Keep the tray compact, anchored to the existing reaction control, and stable on narrow phones.
4. **Sound pass:** Add four short, low-volume motifs and verify that Sound off mutes them. Do not add ambient bot audio by default.
5. **Polish pass:** Tune timing, scale, edge placement, and reduced-motion behavior in the actual game, not just on an isolated design board.

No new game rules, score fields, server messages, dependencies, or persistent settings are required for this phase. Online transmission of reactions would be a separate future task.

## Acceptance checks

- All four reactions are recognizable at mobile size on both the plastic and wooden table backgrounds.
- The tray fits at 320–430 px viewport widths, in Arabic and English, in both light and dark themes.
- No reaction or tray covers a card, score, player name, or primary action.
- A reaction plays once, ends on time, and never delays a turn. Repeated taps and round changes do not leave a stuck effect.
- Player reactions take priority over bot reactions; bots remain occasional and quiet.
- Sound off is silent. Reduced motion shows a static, readable reaction.
- The game remains usable by touch, mouse, keyboard, and screen reader.
