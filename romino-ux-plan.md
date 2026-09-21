# Romino — Plan for a Simpler Interface

## 1. Why

An experienced Romino player tried the game and said it was complicated. She was asked whether she meant the rules, and said no. She knows Romino. What defeated her was the app.

This plan is only about the interface. Every rule stays exactly as it is.

## 2. What this plan does not change

- No game rule changes. Opening, jokers, discards, and scoring stay as they are.
- No server or protocol changes. Every item here is client work, so nothing restarts a running game.
- No new settings. Lowering the opening threshold would make the game easier, but it would hide an interface problem behind a rule change.

## 3. Principles

These decide the arguments that come later.

1. **One way to place a card.** Pick it up, then tap where it goes. The same gesture for a meld, an addition, a joker swap, and a discard.
2. **Show only what is legal right now.** A button she cannot use is a button she has to read and dismiss.
3. **Say what she can do, not what she did wrong.** The engine has 39 ways to refuse an action and almost no way to offer one.
4. **The app counts, she decides.** It should add up her melds and her opening total. It should never choose her play for her.
5. **Few words, short words.** A status line is a signpost, not a paragraph.
6. **Never fix an interface problem by changing a rule.**

## 4. Where it stands today

Measured on a phone-sized screen, four players, during a normal turn.

| What | Now |
|---|---|
| Tappable things on screen | 24 |
| Control buttons under the hand, not counting cards | 7 |
| Control buttons while taking the discard | 11 |
| Taps to open with two melds | 12 |
| Longest status line | 21 words |
| Number chips above the hand | 3 to 4 |
| Seat chips showing your own score | 0 |

The deeper problem is not the count. It is that the app has three different ways to put a card down. A new meld needs a button. An addition needs you to tap the meld. A discard needs a different button. At a real table there is one move: pick cards up, put them somewhere.

## 5. The work, in order

Each phase stands alone and can be put in front of a player before the next one starts.

### Phase 1 — One way to place a card

The core change. Tap cards to pick them up, then tap the destination.

- Tapping empty felt plays the selected cards as a new meld.
- Tapping the discard pile throws the selected card.
- Tapping a table meld adds to it. Unchanged.
- Tapping a table joker swaps it. Unchanged.
- Retire the New meld and Discard buttons.

Both new targets must be real buttons with spoken labels, not bare regions, so keyboard and screen reader users keep every move.

### Phase 2 — Tap a ready meld to play it

The hand is already arranged into groups, and a group that is a legal meld already shows a tick and its points. Make that label the button.

- Tapping the label of a valid group plays that whole group.
- Opening with two melds drops from 12 taps to 3.

### Phase 3 — Show only what is possible

- Hide every action that is not legal at this moment.
- Mark hand cards that fit a meld on the table. They can be added once opened, and they can never be discarded.
- Mark the cards that cannot be discarded, before she tries and is refused.
- On the discard pile, show what taking it would give her, for example "Take, opens 87".

### Phase 4 — Quiet the screen

- Cut the status lines to a few words. The reason moves behind the help button.
- Give the player a seat chip like everyone else, holding her score and card count, and remove those chips from the dock.
- Collapse the arrange row from six controls to one Sort. Dragging already does what the arrows do.
- Keep the log collapsed and show only its last line inline.

### Phase 5 — Remove the staging mode

Taking the discard currently opens a mode with five buttons: New meld, Confirm plays, Undo last, Cancel, Clear selection.

- Show Confirm only once the staged plays are actually legal.
- Remove Undo. Tapping a staged meld returns its cards to the hand.
- With phases 1 and 2 in place, a full opening is: tap the discard, tap two group labels, tap Confirm.

### Phase 6 — First game guidance

- A coached first round that highlights the single thing to do next.
- Skippable, and never shown again once a match has been finished.

## 5b. What is done

Phases 1 to 5 are built. Phase 6, the coached first round, is not.

| Measure | Before | Now |
|---|---|---|
| Control buttons under the hand | 7 | 2 |
| Control buttons while taking the discard | 11 | 1 to 2 |
| Taps to open with two ready melds | 12 | 4 |
| Longest status line | 21 words | 5 words |
| Seat chips showing your own score | 0 | 1, pinned on phones |

Also done, outside the plan: a daylight theme replacing the dark gothic one, and a dark mode that starts from the device setting and can be toggled on every screen.

Still open: Phase 6, and the vocabulary question in section 8.

## 6. How we will know it worked

| What | Now | Target |
|---|---|---|
| Taps to open with two melds | 12 | 3 |
| Control buttons under the hand | 7 | 2 |
| Control buttons while taking the discard | 11 | 1 |
| Longest status line | 21 words | under 8 |
| Refusals she hits per round | not measured | measure first, then halve |

The real test is not the table above. It is watching her play a round again, with the same protocol: sit beside her, do not help, and write down every pause longer than a few seconds, every question she asks, every refusal, and every action she repeats.

## 7. Risks

- **Accidental discard.** Tapping the pile to throw is fast and cannot be undone. The card must already be selected and clearly lifted, and the pile only accepts a tap when that discard is legal.
- **Tap targets versus scrolling.** The felt is a large target on a phone. It must not swallow a scroll or a drag of the hand.
- **Hidden features.** Removing buttons can hide moves from players who learned the old way. The group label and the pile must both say what they do.
- **Accessibility.** Every move that stops being a button must become a labelled button somewhere else. Nothing may become mouse-only or touch-only.

## 8. Open questions for the master

- **The words.** The Arabic interface uses تنزيلة for meld, فتح for opening, and كومة السحب and كومة الرمي for the two piles. If these are not what she says at the table, the whole screen reads like a stranger's game and nothing else in this plan will fix that.
- **What annoyed her most,** ranked: too many taps, not knowing what she was allowed to do, being refused without knowing why, not finding something on screen, or the words being wrong.
- **Where she plays.** Phone or computer. The phone layout is the one this plan assumes.
