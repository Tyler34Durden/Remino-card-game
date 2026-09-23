# Remino Online — Product and Development Plan

## 1. Project goal

Build a polished online version of the Libyan-style Remino card game for desktop and mobile browsers. Players join private rooms, and empty seats are filled by computer-controlled players.

The game server is authoritative: it owns the deck, validates every move, protects private hands, controls bots, and calculates results.

## 2. First-release scope

The first release will support:

- Private rooms with invite codes.
- Four, five, or six total players.
- Human players and computer-controlled players in the same match.
- Automatic bots in empty seats.
- Two standard decks in every game.
- A configurable number of jokers, from none to eight.
- Configurable opening requirements.
- Score-limit and fixed-round match formats.
- Late joining between rounds.
- Reconnection and temporary bot takeover.
- Responsive desktop and mobile controls.
- Server-side rule validation and hidden hands.

Accounts, public matchmaking, ranked play, and persistent match history are outside the first-release scope.

## 3. Room settings

The host selects the following settings when creating a room:

| Setting | Options | Default |
|---|---|---|
| Table size | 4, 5, or 6 players | 4 players |
| Jokers | 0 to 8 jokers in the pack | 4 jokers |
| Opening requirement | Enabled or disabled | Enabled |
| Opening threshold | Configurable number | 65 points |
| Match format | Score limit or fixed rounds | Score limit |
| Score limit | Configurable number | 101 penalty points |
| Number of rounds | Configurable number | 5 rounds |

Room settings become locked when the match begins.

## 4. Players and seats

- Every room has four to six seats, as selected by the host.
- Human players occupy available seats before the match starts.
- When the host starts the match, all empty seats are filled with bots.
- A match can start with one human and bots in all remaining seats.
- Bots follow exactly the same gameplay rules as humans.

## 5. Deck and dealing

- Every game uses two standard 52-card decks.
- No jokers: 104 total cards.
- With jokers: 104 cards plus the number of jokers the host chose. The default is four, for 108 cards.
- Each player receives 14 cards at the start of a round.
- Every physical card has a unique ID, even when two cards share the same rank and suit.
- The unused cards form the face-down stock.
- One valid non-joker card begins the face-up discard pile.
- If a joker is revealed while starting the discard pile, reveal another card instead.
- The dealer rotates after every round.
- Play proceeds clockwise, beginning with the player to the dealer's left.

## 6. Turn sequence

Each turn follows this order:

1. Choose one card source:
   - Draw the top card from the stock; or
   - Take the previous player's top discarded card.
2. Make any table plays permitted by the chosen card source.
3. Discard one card to finish the turn. A joker may be discarded only as the very last card. A card that could be added to a meld already on the table may not be discarded, unless every card in the hand fits the table.

A player may never draw from the stock and take the discard during the same turn.

### 6.1 Drawing from the stock

- Drawing from the stock uses the player's draw action.
- A player who has not opened cannot open or make any table play after a stock draw.
- A player who has already opened may place new melds, add to table melds, and replace jokers after a stock draw.
- The player finishes the turn by discarding one card.

### 6.2 Taking the previous discard

- Taking the previous player's discarded card replaces drawing from the stock.
- The exact discarded card must be used in a new meld, together with cards from the hand, during the same turn.
- Adding the discarded card to a meld already on the table does not satisfy this requirement.
- It cannot be retained for a later turn.
- It cannot be discarded back.
- The player cannot draw another card after taking it.
- The player cannot finish the turn until the discarded card has been used legally.

In this plan, **meld** means either a same-rank set or a suited run.

### 6.3 Empty stock

When the stock becomes empty:

1. Keep the top card of the discard pile face-up.
2. Shuffle the remaining discard cards.
3. Use them as the new stock.

A joker can only be discarded as a final card, which ends the round, so a joker is never part of a rebuilt stock.

## 7. Valid melds

### 7.1 Sets

A set contains at least three cards of the same rank.

Each card in a set must have a different suit. Identical cards from the two decks cannot appear together in the same set.

Valid example:

```text
2♥  2♣  2♠
```

Invalid example:

```text
2♥  2♥  2♣
```

### 7.2 Runs

A run contains at least three consecutive cards of the same suit.

Valid examples:

```text
A♥  2♥  3♥
Q♣  K♣  A♣
```

Invalid example:

```text
K♦  A♦  2♦
```

Runs cannot wrap from a high ace back to 2.

## 8. Opening requirement

The opening requirement is controlled by the room settings.

### 8.1 Opening enabled

- A player must reach the configured opening threshold in one turn.
- The default opening threshold is 65 points.
- Several valid melds may be combined to reach the threshold.
- Cards added individually to existing table melds do not contribute.
- The player must have taken the previous player's discarded card.
- That discarded card must be included in the valid table plays made during the opening turn.
- Each player has an independent opened/not-opened state.

New sets and runs use their normal card values:

| Card | Opening value |
|---|---:|
| 2–10 | Face value |
| J, Q, K | 10 |
| Ace in `A-2-3` | 1 |
| Ace in `Q-K-A` | 10 |
| Ace in a same-rank set | 10 |
| Joker | Value of the represented card |

Only new melds count toward opening. A card added to a meld already on the table, or one that replaces a table joker, contributes **0 opening points**.

Several new melds may be combined to reach the opening threshold.

The opening threshold only determines whether a player may open. Opening points are not rewards and are not added to or removed from the player's penalty score.

### 8.2 Opening disabled

- No opening-point threshold is required.
- The discard-card requirement still applies.
- The player's first legal table play marks that player as opened.

## 9. Joker rules

The host chooses how many jokers are in the pack, from none to eight.

When the pack has at least one joker:

- A joker may substitute for a missing card in a valid set or run.
- The game records the exact natural card represented by the joker.
- The joker contributes the opening value of the card it represents.
- A joker in a run represents one exact card, and only that card may replace it.
- A joker in a same-rank set represents any missing suit, so any natural card of that rank in a missing suit may replace it.
- The player supplying the natural replacement card takes the joker into their hand.
- The recovered joker does not need to be reused immediately.
- A joker may go into a new meld at any time.
- A joker may be added to a meld already on the table only in the turn the player goes out, leaving exactly one card to discard.
- A joker may be discarded only as the very last card, which wins the round.
- A player holding two or more cards that are all jokers passes without discarding.

## 10. Finishing a round

- A player must finish by discarding their final card. That card may be a joker.
- A player cannot win merely by placing every remaining card into melds.
- Table-play validation must ensure that the player keeps one card available for the final discard.
- The first player who legally discards their final card wins the round.

## 11. Penalty scoring

Scores are cumulative penalty points. Lower scores are better.

At the end of a round:

- The player who emptied their hand scores 0.
- Cards already placed on the table score 0.
- Every other player adds the value of cards remaining in their hand.

| Remaining card | Penalty value |
|---|---:|
| 2–10 | Face value |
| J, Q, K | 10 |
| Ace | 10 |
| Joker | 25 |

Example:

```text
A + K + 7 + Joker
10 + 10 + 7 + 25 = 52 penalty points
```

## 12. Match formats

### 12.1 Score-limit mode

- The default limit is 101 penalty points.
- Each round finishes normally before checking the limit.
- When any player reaches or exceeds the configured limit, the entire match ends.
- The player with the lowest cumulative penalty score wins.

### 12.2 Fixed-round mode

- The default match length is five rounds.
- After the configured number of rounds, the player with the lowest cumulative penalty score wins.

### 12.3 Ties

- A match cannot end with shared winners.
- If the lowest score is tied when the match would normally end, additional rounds are played.
- Extra rounds continue until one player has the uniquely lowest score.
- A voluntary early ending is allowed only when one player has the uniquely lowest score.

## 13. Late joining

- A player may join a room after its match has started if a bot seat is available.
- The late player waits until the current round ends.
- Waiting players cannot see private hands.
- At the start of the next round, the new player replaces a bot.
- The new player receives the current highest cumulative penalty score.
- This prevents a late joiner from gaining a scoring advantage.
- If every seat is already human-controlled, no additional player may join.

## 14. Disconnections

- A disconnected human receives a short reconnection period.
- If the player does not return, a bot temporarily takes over the seat.
- The bot inherits the player's hand, opened state, seat, and score.
- A returning player may reclaim the same seat.
- Control should return to the human before that seat's next turn whenever possible.
- Reconnection never reveals another player's private cards.

## 15. Host departure

- If the host leaves the room, the room ends.
- Hosting is not transferred in the first release.
- All connected players receive a clear room-closed message.

## 16. Computer-player behavior

The first bot will be deterministic and rule-based. It will:

1. Evaluate whether the top discard enables a legal table play.
2. Take the discard only when it can use that card during the same turn.
3. Otherwise draw from the stock.
4. Find valid sets, runs, openings, and additions to existing melds.
5. Replace table jokers when useful.
6. Avoid becoming stuck with a joker when possible.
7. Prefer discarding high-penalty cards that are unlikely to become useful.
8. Follow the same information restrictions and rules as a human player.

## 17. Interface plan

### 17.1 Home screen

- Create a private room.
- Join with a room code.
- Enter a display name.
- Read the game rules.

### 17.2 Room setup and lobby

- Configure table size, jokers, opening rules, and match format.
- Display and copy the invite code.
- Show human players, empty seats, and planned bot seats.
- Allow only the host to start the match.
- Lock settings after the match starts.

### 17.3 Game table

- Show opponents, connection state, scores, opened status, and card counts.
- Show the stock, top discard, and all table melds.
- Show only the current player's private hand.
- Clearly indicate the active player and required action.
- Warn that taking the discard commits the player to using it.
- Highlight the required discarded card until it has been used legally.
- Display opening totals while the player prepares table plays.
- Support tap/click selection first; drag-and-drop is an enhancement.

### 17.4 Results

- Show the round winner.
- Show each remaining hand and its penalty calculation.
- Show cumulative scores.
- Explain whether the match continues, enters a tiebreak round, or has ended.

### 17.5 Accessibility

- Do not communicate suit or validity using color alone.
- Provide visible focus states and keyboard controls.
- Use large touch targets.
- Allow reduced motion and muted sound.
- Keep text ready for future English and Arabic localization.

## 18. Technical architecture

### 18.1 Client

- React and TypeScript.
- Vite for development and production builds.
- Responsive interface for desktop and mobile browsers.
- Socket.IO client for live room communication.

### 18.2 Rules engine

- Pure TypeScript with no user-interface dependencies.
- Deterministic deck, turn, meld, opening, joker, scoring, and victory logic.
- Immutable or safely copied state transitions.
- Useful errors for every rejected action.

### 18.3 Server

- Node.js and Socket.IO.
- The server is authoritative over all room and game state.
- Clients send requested actions rather than modified game states.
- The server validates actions before broadcasting results.
- Each player receives only public state and their own hand.
- Bots run on the server.
- Session tokens support reconnection.
- Room codes are private and difficult to guess.

### 18.4 Initial persistence

- First-release rooms may live in server memory.
- A server restart may close active rooms in the first deployment.
- Persistent rooms and match history can be added later using a database and shared room-state store.

## 19. Server actions

The server will accept explicit actions such as:

- `CREATE_ROOM`
- `JOIN_ROOM`
- `RECONNECT_PLAYER`
- `START_MATCH`
- `DRAW_FROM_STOCK`
- `TAKE_DISCARD_AND_PLAY`
- `OPEN_WITH_MELDS`
- `PLAY_NEW_MELD`
- `ADD_TO_MELD`
- `REPLACE_JOKER`
- `DISCARD_CARD`
- `START_NEXT_ROUND`
- `RECLAIM_BOT_SEAT`
- `END_ROOM`

Taking the discard and proving its legal use should be handled as one server-controlled transaction or as a locked turn state that cannot end until the card is used.

## 20. Testing plan

Automated tests must cover at least:

### Rooms and players

- Four-, five-, and six-seat rooms.
- Bots filling every empty seat.
- Late players waiting until the next round.
- Late players receiving the highest current penalty score.
- Full-human rooms rejecting additional players.
- Host departure closing the room.

### Decks

- Two decks are always generated.
- Exactly the chosen number of jokers is included.
- Every physical card has a unique ID.
- Fourteen cards are dealt to every player.
- A joker never begins the discard pile, and enters it only as a final card.

### Turn flow

- A player cannot draw twice.
- A player cannot draw from both sources.
- A stock draw does not permit an unopened player to meld.
- An opened player may place new melds after a stock draw.
- A taken discard must be used during that turn.
- The taken discard cannot be retained or discarded back.
- Discarding ends the turn.
- The stock is rebuilt correctly when empty.

### Melds

- Valid sets and runs are accepted.
- Identical rank-and-suit cards in one set are rejected.
- `A-2-3` is accepted with Ace worth 1 for opening.
- `Q-K-A` is accepted with Ace worth 10 for opening.
- `K-A-2` is rejected.
- Several melds may combine to meet the opening threshold.
- Additions to existing melds and joker replacements contribute no opening points.

### Jokers

- Jokers substitute for valid missing cards.
- Joker representations are recorded unambiguously.
- Exact natural cards can replace table jokers.
- Recovered jokers return to the player's hand.
- Recovered jokers do not require immediate reuse.
- A joker can be discarded only as the last card.
- A joker can be added to a table meld only in the turn that goes out.

### Scoring and match completion

- The round winner scores 0.
- Remaining-card penalties are calculated correctly.
- Jokers left in hand score 25.
- Score-limit matches end for everyone after a completed round.
- Fixed-round matches end after the configured number of rounds.
- Tied matches continue into additional rounds.
- A player must discard a final card to win.

### Networking and privacy

- A player never receives another player's hand.
- Invalid or out-of-turn actions are rejected.
- Duplicate and reordered network actions do not corrupt state.
- A disconnected player is replaced by a bot.
- A reconnecting player can reclaim their seat safely.

## 21. Development phases

### Phase 1 — Rules engine

- Define the complete typed game model.
- Build and shuffle the two-deck configuration.
- Implement turn-state validation.
- Implement sets, runs, aces, openings, additions, and jokers.
- Implement round completion and both match formats.
- Complete core automated tests.

### Phase 2 — Online rooms

- Create and join private rooms.
- Add host settings and invite codes.
- Protect player sessions with reconnectable tokens.
- Expose player-specific public state.
- Add authoritative server action handling.

### Phase 3 — Playable interface

- Build home, room setup, and lobby screens.
- Build the responsive card table.
- Add hand selection, stock/discard controls, meld preparation, and validation messages.
- Add round and match results.

### Phase 4 — Bots

- Implement a legal baseline bot.
- Add discard evaluation and meld search.
- Add joker replacement and opening strategy.
- Run unattended bot matches to detect impossible states and crashes.

### Phase 5 — Multiplayer resilience

- Add late joining and waiting-player behavior.
- Add disconnect timers and bot takeover.
- Add safe player seat reclamation.
- Test latency, reconnects, duplicate actions, and host departure.

### Phase 6 — Polish and deployment

- Add optional animation and sound.
- Improve mobile layout, accessibility, and rules guidance.
- Run browser and device testing.
- Add deployment configuration and production monitoring.

## 22. First-release completion criteria

The first release is complete when:

- A host can create a configured four-to-six-seat room.
- Friends can join using a private room code.
- Bots fill every empty seat.
- A full match works with two decks.
- Private hands are never exposed.
- Every action is validated by the server.
- The discard-card requirement is enforced.
- Opening calculations follow the agreed rules.
- Duplicate cards, aces, and jokers follow the agreed rules.
- A player must discard a final card to win.
- Both match formats and tiebreak rounds work.
- Late joining, disconnect takeover, and seat reclamation work.
- The interface works on typical desktop and mobile browsers.
- The applicable rules can be read inside the game.
