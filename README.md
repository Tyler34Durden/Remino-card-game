# Romino Online

An online version of the Libyan-style Romino card game for desktop and mobile browsers. Players join private rooms with an invite code, and bots fill every empty seat. The server owns the deck, validates every move, and only ever sends a player their own hand.

The full product specification is in [romino-online-game-plan.md](romino-online-game-plan.md).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. Vite serves the client and proxies the socket to the game server on port 3001. Open a second browser profile or a private window to join the same room as another player.

| Command | What it does |
|---|---|
| `npm run dev` | Client and server with reload on change |
| `npm test` | All automated tests |
| `npm run typecheck` | TypeScript check of client, server, engine, and tests |
| `npm run build` | Type check, then build the client into `dist/` |
| `npm start` | Production server. Serves `dist/` and the socket on `PORT` (default 3001) |

## Layout

| Folder | Contents |
|---|---|
| `shared/` | Types used by the client, the server, and the engine |
| `engine/` | Pure TypeScript rules engine and the bot. No UI or network code |
| `server/` | Express and Socket.IO server, rooms, sessions, bot scheduling, input validation |
| `src/` | React client |
| `tests/` | Vitest suites for the engine, bots, rooms, and real sockets |
| `public/cards/` | Card images copied from `Classic Playing Cards/` under web-friendly names |

### Engine

- `engine/cards.ts` builds the two-deck pack, shuffles with a seeded generator, and holds card values.
- `engine/melds.ts` lists every legal reading of a set or run, including what each joker stands for.
- `engine/plays.ts` validates a list of table plays as one unit. The client reuses it to preview staged plays.
- `engine/game.ts` holds the match state machine: turns, stock rebuild, round end, scoring, both match formats, tiebreaks.
- `engine/bot.ts` is the deterministic bot. It sees only what a human in that seat could see.

State transitions never mutate their input, and a match is fully determined by its settings and seed.

### Arranging the hand

Players can arrange their hand into their own groups to prepare melds. They drag a card next to another card or onto the new-group zone. On a touch screen they hold the card briefly first, so the page can still scroll. The same moves are available as buttons: group the selected cards, nudge one card left or right, group by suit, or group by rank. The arrangement is a personal view only. It lives in `src/handLayout.ts`, is saved per room and round in the browser, and never reaches the server.

### Score line and meld calculator

Above the hand the player sees their own cumulative score and what the cards in their hand would cost if the round ended now. The meld calculator in `src/meldPlanner.ts` then values the hand as the player has arranged it:

- Every arranged group that is already a legal meld shows a tick and its points under the cards.
- A player who has not opened sees "Ready melds: X of 65", the total of those groups against the room's threshold.
- On the player's turn, before they take a card, each group that the face-up discard would complete shows what it would be worth with that card. A second total shows the best result of taking it, because opening always needs the discard in a new meld.
- Selecting three or more cards shows what they are worth as a new meld, or why they are not one.

The calculator uses the same meld rules as the server and never sends anything. A test plays the calculator's plan against the engine and checks that the server opens with exactly the promised points.

### Phone layout

`src/mobile.css` holds the phone layout. Everything in it sits inside a `max-width: 640px` query, so the desktop layout never changes. On a phone the whole game fits one screen:

- The top bar is one slim row, and its buttons fold into a menu.
- Opponents form a single strip that scrolls sideways and keeps the active player in view.
- The status line, the hand, and the action buttons form a dock that stays at the bottom of the screen.
- The hand is one fan. The step between cards shrinks as the hand grows, using the card and group counts that `Hand.tsx` passes as CSS variables, so fifteen cards still fit without scrolling.
- Long tips hide behind a help button, arrange buttons use short labels, dialogs open as bottom sheets, and the results table becomes one card per player.

A few small hooks in the markup exist only for phones and are hidden on desktop: the menu button, the tips button, and the short labels.

### Taking the discard

The plan allows either a locked turn state or a single transaction. This build uses the transaction. The player stages plays locally, sees the opening total, and sends `TAKE_DISCARD_AND_PLAY` with the whole list. The server accepts or rejects it as one unit, so a player can never be stuck holding a discard they cannot use.

## Rule decisions the plan left open

These choices are isolated in the engine and easy to change.

- The host picks how many jokers are in the pack, from 0 to 8 (`MAX_JOKERS` in `shared/types.ts`). The default is 4.
- A new meld needs at least two natural cards (`MIN_NATURAL_CARDS` in `engine/melds.ts`).
- A run uses the ace at one end only, so its longest form is 13 cards.
- Opening always needs the discard. Once a player has opened, every kind of play is legal in any turn, including new melds after a stock draw.
- A card that could be added to a meld on the table may not be discarded. This applies to every player, opened or not. If every card in hand fits the table, any of them may be discarded, so a turn can always end.
- Only new melds count toward opening. A card added to a meld already on the table, or one that replaces a table joker, is worth 0 opening points.
- Adding a fitting card to a set that holds a joker asks the player whether to take the joker or leave it on the table.
- The taken discard must go into a new meld with cards from the hand. Adding it to a table meld or using it to replace a joker does not count.
- A joker in a run stands for one exact card. A joker in a set stands for any missing suit, so any natural card of a missing suit can replace it.
- A joker may go into a new meld at any time. It may be added to a meld already on the table only in the turn the player goes out, leaving exactly one card to discard.
- A joker may be discarded only as the very last card, which wins the round.
- A player holding two or more cards that are all jokers passes without discarding (`PASS_TURN`). Without this the game could deadlock.
- If the stock is empty and cannot be rebuilt, a stock draw ends the round with no winner and everyone scores their hand.
- The first player of a round may take the starter card.
- A disconnected host is covered by a bot after the normal grace period. The room closes if the host stays away for the longer host grace period. A host who leaves on purpose closes the room at once.
- After a match ends, the host can start a new match in the same room.

## Deployment

```bash
docker build -t romino .
docker run -p 3001:3001 romino
```

The container serves the built client and the socket from one port. Put it behind a proxy that supports WebSockets.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3001 | HTTP and socket port |
| `BOT_DELAY_MS` | 900 | Pause before each bot action |
| `RECONNECT_GRACE_MS` | 30000 | Wait before a bot covers a dropped player |
| `HOST_GRACE_MS` | 120000 | Wait before a dropped host closes the room |

Monitoring endpoints: `GET /healthz` for liveness, and `GET /metrics` for room, player, socket, and memory counts. The server logs one JSON line per lifecycle event.

Rooms live in server memory, so a restart closes active rooms. Run a single instance until a shared room store is added.

### What the host must support

The game needs one long-running Node process with WebSocket support. Serverless platforms such as Vercel or Netlify functions do not fit, because they cannot hold a socket open or keep rooms in memory.

### Render

`render.yaml` describes the service. Push the repository to GitHub, then in Render choose New, Blueprint, and pick the repository. Render builds the client, starts the server on its own `PORT`, and checks `/healthz`. On the free plan the service sleeps after about 15 minutes without traffic, and waking it takes close to a minute. Sleeping also clears every room.

### Sharing from your own computer

For a quick game without hosting, build and start the production server, then expose port 3001 with a tunnel such as Cloudflare Tunnel or ngrok and send friends the public address it prints. The game only lasts while your computer and the tunnel stay on.

```bash
npm run build
```

```bash
npm start
```


## Localization

The game runs in English and Arabic. A switch on every screen changes the language, and the choice is remembered in the browser. A browser set to Arabic starts in Arabic.

- `src/i18n.ts` holds the English text and the language switch. `src/i18n.ar.ts` holds the Arabic text. TypeScript refuses to build if the Arabic file misses a key.
- `src/components/RulesAr.tsx` is the Arabic rules text. It follows the room settings like the English one.
- The rules engine and the server still speak English. `src/serverText.ts` turns their rejection messages, log lines, closing reasons, and bot names into Arabic on the client, so the server protocol is unchanged. Text it does not recognise is shown in English. `tests/serverText.test.ts` feeds it real engine and room output and fails when a message loses its translation, so add a rule there whenever a server message is added or reworded.
- Arabic switches the page to right to left. Fans of cards stay left to right on purpose, because the index of a playing card sits in its top left corner. Card codes such as 7♠, room codes, and score sums are isolated so they keep their order inside Arabic sentences.
- Counts are written as "label: number" in Arabic, because Arabic plural forms change with the number.
