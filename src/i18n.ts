// English interface text and the language switch. The Arabic dictionary lives in i18n.ar.ts.
// Use {name} placeholders rather than string concatenation, because word order differs between languages.
import { ar } from "./i18n.ar.ts";

const en = {
  "app.title": "Remino",
  "app.tagline": "The Libyan card game, online with friends.",
  "app.taglineSolo": "A Libyan card game.",
  "app.connecting": "Connecting to the server…",
  "app.offline": "Connection lost. Reconnecting…",
  // The switch shows the name of the language it changes to.
  "app.language": "العربية",
  "app.menu": "Menu",

  "home.name": "Display name",
  "home.namePlaceholder": "Your name",
  "home.playSolo": "Play against bots",
  "home.create": "Create a private room",
  "home.join": "Join a room",
  "home.code": "Room code",
  "home.codePlaceholder": "6 characters",
  "home.joinButton": "Join",
  "home.createButton": "Create room",
  "home.rules": "Read the rules",
  "home.style": "My style",
  "home.nameRequired": "Enter a display name first.",
  "home.back": "Back",

  "settings.title": "Room settings",
  "settings.seats": "Table size",
  "settings.seatsOption": "{count} players",
  "settings.jokers": "Jokers in the deck",
  "settings.jokersNone": "No jokers",
  "settings.jokersOne": "1 joker",
  "settings.jokersOption": "{count} jokers",
  "settings.opening": "Opening requirement",
  "settings.threshold": "Opening threshold (points)",
  "settings.format": "Match format",
  "settings.scoreLimit": "Score limit",
  "settings.fixedRounds": "Fixed rounds",
  "settings.limit": "Score limit (penalty points)",
  "settings.rounds": "Number of rounds",
  "settings.locked": "Settings are locked once the match begins.",
  "settings.summaryOpening": "Opening {points}",
  "settings.summaryNoOpening": "No opening threshold",
  "settings.summaryLimit": "First to {limit} ends the match",
  "settings.summaryRounds": "{count} rounds",

  "lobby.title": "Room lobby",
  "lobby.invite": "Invite code",
  "lobby.copy": "Copy code",
  "lobby.copyLink": "Copy invite link",
  "lobby.copied": "Copied",
  "lobby.seats": "Seats",
  "lobby.empty": "Empty. A bot will sit here.",
  "lobby.host": "Host",
  "lobby.you": "You",
  "lobby.bot": "Bot",
  "lobby.start": "Start match",
  "lobby.waitingHost": "Waiting for the host to start the match.",
  "lobby.leave": "Leave room",
  "lobby.botsNote": "{count} empty seats will be filled by bots.",

  "table.round": "Round {number}",
  "table.tiebreak": "Tiebreak round {number}",
  "shuffle.title": "Shuffle the cards",
  "shuffle.players": "Players at the table",
  "shuffle.yourTurn": "You're the dealer. Swipe or tap the deck three times.",
  "shuffle.waiting": "{name} is shuffling…",
  "shuffle.dealing": "Dealing cards…",
  "shuffle.handsSoon": "Your hand will appear in a moment.",
  "shuffle.deckAction": "Shuffle the deck once",
  "shuffle.progress": "Shuffle {count} of 3",
  "shuffle.dealingHint": "Cards on their way!",
  "table.stock": "Stock",
  "table.stockCount": "{count} cards",
  "table.discard": "Discard pile",
  "table.discardEmpty": "Empty",
  "table.melds": "Melds on the table",
  "table.noMelds": "No melds yet.",
  "table.hand": "Your hand",
  "table.cards": "{count} cards",
  "table.score": "{score} pts",
  "table.opened": "Opened",
  "table.notOpened": "Not opened",
  "table.dealer": "Dealer",
  "table.offline": "Offline",
  "table.botPlaying": "Bot playing",
  "table.reserved": "{name} joins next round",
  "table.log": "Game log",
  "table.waiting": "You will take a seat when the next round starts. Until then you can watch the table.",
  "table.sortSuit": "Group by suit",
  "table.sortRank": "Group by rank",
  "table.sortSuitShort": "By suit",
  "table.sortRankShort": "By rank",
  "table.owner": "Played by {name}",
  "table.set": "Set",
  "table.run": "Run",
  "table.pending": "Pending",
  "table.jokerAs": "Joker as {card}",
  "table.jokerAsAny": "Joker as any missing {rank}",
  "table.mustUse": "Must use",
  "table.justDrawn": "Just drawn",
  "table.swap": "Swap",

  "swap.title": "This set holds a joker",
  "swap.take": "Take the joker",
  "swap.takeDetail": "Your {card} replaces the joker, and the joker goes into your hand.",
  "swap.leave": "Leave the joker",
  "swap.leaveDetail": "Your {card} joins as the fourth card, and the joker stays on the table.",

  "hand.arrange": "Arrange hand",
  "hand.groupSelected": "Group selected",
  "hand.groupShort": "Group",
  "hand.moveLeft": "Move the selected card left",
  "hand.moveRight": "Move the selected card right",
  "hand.group": "Group {number}",
  "hand.newGroup": "+ New group",
  "hand.hint": "Drag a card to rearrange your hand. On a touch screen, hold the card for a moment first. Arranging is only for you and never counts as a play.",

  "planner.title": "Your points and meld calculator",
  "planner.score": "Your score: {score}",
  "planner.handValue": "Cards in hand: {points} pts",
  "planner.handShort": "hand {points}",
  "planner.ready": "Ready melds: {points} of {needed}",
  "planner.withDiscard": "With the {card}: {points} of {needed}",
  "planner.selected": "Selected: {type}, {points} pts",
  "planner.selectedInvalid": "Selected cards are not a meld.",

  "turn.shortDraw": "Your turn. Take a card.",
  "turn.shortDiscard": "Throw a card.",
  "turn.shortTaking": "Build your melds, then confirm.",
  "turn.shortPass": "Pass your turn.",
  "turn.why": "Why?",

  "turn.other": "{name} is playing.",
  "turn.draw": "Draw from the stock, or take the discard if you can build a new meld with it now.",
  "turn.drawUnopened": "Draw from the stock, or take the discard to open with {points} points.",
  "turn.afterStock": "You drew from the stock. Place new melds or add to melds on the table if you wish, then discard one card.",
  "turn.afterStockUnopened": "You drew from the stock. You have not opened yet, and opening needs the discard, so choose one card to discard.",
  "turn.afterDiscard": "Make any further plays, then discard one card to end your turn.",
  "turn.taking": "You are taking the {card}. It must go into a new meld with cards from your hand. Build your plays, then confirm.",
  "turn.discardBlocked": "You cannot discard the {card}. It fits a meld on the table, so choose another card.",
  "warning.title": "Try another move",
  "warning.dismiss": "Dismiss warning",
  "turn.onlyJokers": "You hold only jokers, and a joker can be discarded only as your last card, so you pass.",
  "turn.stockEmpty": "The stock is empty and cannot be rebuilt. Drawing will end the round with no winner.",

  "action.drawStock": "Draw from stock",
  "action.takeDiscard": "Take discard",
  "action.takeWarning": "Taking the discard commits you to a new meld that uses it this turn. Adding it to a table meld does not count.",
  "action.newMeld": "New meld",
  "action.playHere": "Play as a new meld",
  "action.playGroup": "Play this meld",
  "action.playShort": "Play",
  "action.throwHere": "Throw {card} here",
  "action.sort": "Sort",
  "action.sortHint": "Arrange my hand into melds",
  "action.addHint": "Tap cards to pick them up, then tap where they go. A meld on the table adds them, the green table lays a new meld, and the discard pile throws. Tap a joker marked Swap to take it.",
  "action.discard": "Discard",
  "action.pass": "Pass turn",
  "action.confirm": "Confirm plays",
  "action.undo": "Undo last",
  "action.cancel": "Cancel",
  "action.clear": "Clear selection",
  "action.addHere": "Add selected cards to this meld",
  "action.replaceJoker": "Replace this joker with the selected card",

  "opening.total": "Opening total: {points} of {needed}",
  "opening.reached": "Threshold reached",
  "opening.free": "No threshold. Any new meld that uses the taken card opens.",

  "joker.choose": "What should the joker stand for?",

  "result.roundTitle": "Round {number} is over",
  "result.winner": "{name} went out and scores 0.",
  "result.blocked": "The stock ran out, so nobody won this round.",
  "result.player": "Player",
  "result.remaining": "Cards left",
  "result.penalty": "This round",
  "result.total": "Total",
  "result.noCards": "No cards",
  "result.next": "Start next round",
  "result.nextTiebreak": "Start tiebreak round",
  "result.endEarly": "End match now",
  "result.continues": "The match continues.",
  "result.tiebreak": "The lowest score is tied, so a tiebreak round will be played.",
  "result.waitHost": "Waiting for the host to continue.",
  "result.matchTitle": "Match over",
  "result.matchWinner": "{name} wins with the lowest score.",
  "result.playAgain": "Play again",
  "result.show": "Show results",
  "result.hide": "View the table",

  "prefs.sound": "Sound",
  "prefs.botReactions": "Bot reactions",
  "prefs.motion": "Reduced motion",
  "prefs.language": "Language",
  "prefs.theme": "Appearance",
  "prefs.on": "On",
  "prefs.off": "Off",
  "prefs.dark": "Dark",
  "prefs.light": "Light",
  "prefs.rules": "Rules",
  "prefs.tips": "Game tips",
  "back.title": "Card back",
  "back.classic": "Classic",
  "back.gold": "Gold arabesque",
  "back.azure": "Azure tile",
  "back.rose": "Rose garden",
  "back.borj": "Borj",
  "back.fakher": "Al Fakher",
  "back.mazaya": "Mazaya",
  "back.qaiser": "Qaiser",
  "tableBackground.title": "Your table",
  "tableBackground.plastic": "Plastic café",
  "tableBackground.wood": "Wood café",
  "avatar.title": "Your avatar",
  "avatar.option": "Avatar {number}",
  "reaction.open": "Reactions",
  "reaction.close": "Close reactions",
  "reaction.tea": "Tea sip",
  "reaction.coffee": "Coffee break",
  "reaction.hookah": "Hookah puff",
  "reaction.bravo": "Well played!",
  "reaction.teaShort": "Tea",
  "reaction.coffeeShort": "Coffee",
  "reaction.hookahShort": "Hookah",
  "reaction.bravoShort": "Bravo!",
  "prefs.leave": "Leave",
  "prefs.leaveConfirmHost": "You are the host. Leaving closes the room for everyone. Leave?",
  "prefs.leaveConfirm": "Leave this room? A bot will take your seat.",

  "closed.title": "Room closed",
  "closed.ok": "Back to home",

  "rules.title": "How to play Remino",
  "rules.close": "Close",
  "rules.roomNote": "These rules reflect the settings of your current room.",

  "card.joker": "Joker",
  "card.of": "{rank} of {suit}",
  "card.back": "Face-down card",
  "suit.clubs": "clubs",
  "suit.diamonds": "diamonds",
  "suit.hearts": "hearts",
  "suit.spades": "spades",
  "rank.A": "Ace",
  "rank.J": "Jack",
  "rank.Q": "Queen",
  "rank.K": "King",
} as const;

export type MessageKey = keyof typeof en;
export type Language = "en" | "ar";
type Dictionary = Record<MessageKey, string>;

const LANGUAGE_KEY = "romino-language";
const dictionaries: Record<Language, Dictionary> = { en, ar };
let language: Language = "en";

/** The saved choice, or Arabic for a browser set to Arabic, or English. */
export function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === "en" || saved === "ar") return saved;
  } catch {
    // Without storage the browser language decides.
  }
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function getLanguage(): Language {
  return language;
}

export function setLanguage(next: Language): void {
  language = next;
  try {
    localStorage.setItem(LANGUAGE_KEY, next);
  } catch {
    // The choice then lasts until the page is reloaded.
  }
}

export function directionOf(lang: Language): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return dictionaries[language][key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/**
 * Wraps text such as "7♠" so that it keeps its left-to-right order inside an Arabic sentence.
 * Without this the suit symbol would jump to the other side of the number.
 */
export function ltr(text: string): string {
  return language === "ar" ? "\u2066" + text + "\u2069" : text;
}
