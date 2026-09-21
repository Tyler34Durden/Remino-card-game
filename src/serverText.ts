import { getLanguage, ltr } from "./i18n.ts";

/*
 * The rules engine and the server speak English: rejection messages, log lines, and bot names.
 * This module turns that text into Arabic on the client, so the server protocol stays unchanged.
 * Anything it does not recognise is shown as it arrived, which keeps new server messages readable.
 * tests/serverText.test.ts feeds it real engine output to catch messages that lose their translation.
 */

const BOT_NAMES: Record<string, string> = {
  Salem: "سالم",
  Hamza: "حمزة",
  Faraj: "فرج",
  Mansour: "منصور",
  Younes: "يونس",
  Khalifa: "خليفة",
};

const SUITS_AR: Record<string, string> = { clubs: "السباتي", diamonds: "الديناري", hearts: "القلوب", spades: "البستوني" };
const RANKS_AR: Record<string, string> = { A: "الآس", J: "الولد", Q: "البنت", K: "الشايب" };
const MELD_AR: Record<string, string> = { set: "مجموعة", run: "تسلسل" };
const THAT_MELD_AR: Record<string, string> = { set: "هذه المجموعة", run: "هذا التسلسل" };

const CARD = "(?:10|[2-9AJQK])[♣♦♥♠]|Joker";

/** A seat name as the viewer should read it. Bots get an Arabic name in Arabic. */
export function localName(name: string): string {
  if (getLanguage() !== "ar") return name;
  const bot = /^Bot (\w+)$/.exec(name);
  return bot ? `الروبوت ${BOT_NAMES[bot[1]] ?? bot[1]}` : name;
}

function card(label: string): string {
  return label === "Joker" ? "الجوكر" : ltr(label);
}

function cards(labels: string): string {
  return labels.split(" ").map(card).join(" ");
}

function rank(value: string): string {
  return RANKS_AR[value] ?? value;
}

/** "a set of 4, 1 card added to a run" and so on. */
function plays(text: string): string {
  return text
    .split(", ")
    .map((part) => {
      let m = /^a (set|run) of (\d+)$/.exec(part);
      if (m) return `${MELD_AR[m[1]]} من ${m[2]} أوراق`;
      m = /^(\d+) cards? added to a (set|run)$/.exec(part);
      if (m) return m[1] === "1" ? `ورقة أضيفت إلى ${MELD_AR[m[2]]}` : `${m[1]} أوراق أضيفت إلى ${MELD_AR[m[2]]}`;
      m = new RegExp(`^a joker replaced with (${CARD})$`).exec(part);
      if (m) return `جوكر استُبدل بالورقة ${card(m[1])}`;
      return part;
    })
    .join("، ");
}

const EXACT: Record<string, string> = {
  // Turn and play rejections
  "It is not your turn.": "ليس دورك الآن.",
  "No round is in progress.": "لا توجد جولة جارية.",
  "Unknown seat.": "مقعد غير معروف.",
  "Unknown action.": "حركة غير معروفة.",
  "Unknown table play.": "لعبة غير معروفة.",
  "You have already taken a card this turn.": "لقد أخذت ورقة في هذا الدور.",
  "The discard pile is empty.": "كومة الرمي فارغة.",
  "Choose at least one table play.": "اختر تنزيلة واحدة على الأقل.",
  "Take a card before making table plays.": "خذ ورقة قبل أن تنزّل.",
  "Take a card before discarding.": "خذ ورقة قبل أن ترمي.",
  "Take a card before ending your turn.": "خذ ورقة قبل أن تنهي دورك.",
  "That card is not in your hand.": "هذه الورقة ليست في يدك.",
  "A selected card is not in your hand.": "إحدى الأوراق المحددة ليست في يدك.",
  "A joker can be discarded only as your very last card.": "لا يُرمى الجوكر إلا إذا كان ورقتك الأخيرة.",
  "A joker can be added to a meld on the table only in the turn you go out, leaving exactly one card to discard.":
    "لا يُضاف الجوكر إلى تنزيلة على الطاولة إلا في الدور الذي تنهي فيه أوراقك، بحيث تبقى ورقة واحدة فقط لترميها.",
  "You must discard a card to end your turn.": "يجب أن ترمي ورقة لتنهي دورك.",
  "You must keep one card for your final discard.": "يجب أن تبقي ورقة واحدة لترميها في النهاية.",
  "You have not opened yet. Opening requires taking the previous discard.": "لم تفتح بعد. الفتح يتطلب أخذ الورقة المرمية.",
  "That meld is no longer on the table.": "هذه التنزيلة لم تعد على الطاولة.",
  "That joker is not in the chosen meld.": "هذا الجوكر ليس في التنزيلة المختارة.",
  "The card you take from the discard pile must go into a new meld with cards from your hand. It cannot be added to a meld on the table.":
    "الورقة التي تأخذها من كومة الرمي يجب أن تدخل في تنزيلة جديدة مع أوراق من يدك. لا يمكن إضافتها إلى تنزيلة على الطاولة.",
  // Invalid melds
  "A meld needs at least three cards.": "التنزيلة تحتاج إلى ثلاث أوراق على الأقل.",
  "A meld needs at least two natural cards.": "التنزيلة تحتاج إلى ورقتين عاديتين على الأقل.",
  "Identical cards cannot share a meld.": "لا يمكن أن تجتمع ورقتان متطابقتان في تنزيلة واحدة.",
  "A set cannot contain two cards of the same suit.": "لا يمكن أن تحتوي المجموعة على ورقتين من النوع نفسه.",
  "A set cannot hold more than four cards.": "لا تتسع المجموعة لأكثر من أربع أوراق.",
  "A run needs consecutive cards of one suit, and it cannot wrap from ace back to 2.": "التسلسل يحتاج إلى أوراق متتالية من نوع واحد، ولا يمكن أن يلتف من الآس إلى 2.",
  "These cards are neither a same-rank set nor a suited run.": "هذه الأوراق ليست مجموعة من رقم واحد ولا تسلسلاً من نوع واحد.",
  // Rooms
  "Enter a display name.": "اكتب اسم اللاعب.",
  "No room has that code.": "لا توجد غرفة بهذا الرمز.",
  "That room is full.": "هذه الغرفة ممتلئة.",
  "Every seat in that room is taken by a player.": "كل مقاعد هذه الغرفة يشغلها لاعبون.",
  "Someone in that room already uses this name.": "هناك لاعب في الغرفة يستعمل هذا الاسم.",
  "The server is full. Try again later.": "الخادم ممتلئ. حاول لاحقاً.",
  "That room no longer exists.": "هذه الغرفة لم تعد موجودة.",
  "That session is no longer valid.": "هذه الجلسة لم تعد صالحة.",
  "You are not in a room.": "أنت لست في غرفة.",
  "You do not have a seat yet.": "ليس لك مقعد بعد.",
  "You are waiting for the next round.": "أنت في انتظار الجولة القادمة.",
  "Only the host can change the settings.": "المضيف وحده يغيّر الإعدادات.",
  "Only the host can start the match.": "المضيف وحده يبدأ المباراة.",
  "Only the host can start the next round.": "المضيف وحده يبدأ الجولة التالية.",
  "Only the host can end the match.": "المضيف وحده ينهي المباراة.",
  "Settings are locked once the match begins.": "تُقفل الإعدادات عند بدء المباراة.",
  "The match has already started.": "المباراة بدأت بالفعل.",
  "The next round cannot start now.": "لا يمكن بدء الجولة التالية الآن.",
  "A match can only be ended between rounds.": "لا تُنهى المباراة إلا بين الجولات.",
  "The lowest score is tied, so the match cannot end yet.": "أقل مجموع متعادل، فلا يمكن إنهاء المباراة بعد.",
  "There are more players than seats at that table size.": "عدد اللاعبين أكبر من مقاعد هذا الحجم.",
  "The table changed before your action arrived. Please try again.": "تغيّرت الطاولة قبل وصول حركتك. حاول مرة أخرى.",
  "That action is not valid.": "هذه الحركة غير صالحة.",
  "Those room settings are not valid.": "إعدادات الغرفة هذه غير صالحة.",
  "The server could not process that action.": "تعذّر على الخادم تنفيذ هذه الحركة.",
  // Settings
  "Table size must be 4, 5, or 6.": "حجم الطاولة يجب أن يكون 4 أو 5 أو 6.",
  "Opening threshold must be a whole number from 1 to 300.": "حد الفتح يجب أن يكون عدداً صحيحاً من 1 إلى 300.",
  "Score limit must be a whole number from 10 to 2000.": "حد النقاط يجب أن يكون عدداً صحيحاً من 10 إلى 2000.",
  "Number of rounds must be a whole number from 1 to 50.": "عدد الجولات يجب أن يكون عدداً صحيحاً من 1 إلى 50.",
  "Unknown match format.": "نظام مباراة غير معروف.",
  "Invalid settings.": "إعدادات غير صالحة.",
  // Room closed
  "The host left, so the room has closed.": "غادر المضيف، فأُغلقت الغرفة.",
  "The room was idle for too long.": "بقيت الغرفة بلا نشاط مدة طويلة.",
  "The server is restarting.": "يُعاد تشغيل الخادم.",
  // Log lines without names
  "The lowest score is tied, so a tiebreak round will be played.": "أقل مجموع متعادل، لذلك ستُلعب جولة فاصلة.",
  "The stock ran out and cannot be rebuilt. The round ends with no winner.": "نفدت كومة السحب ولا يمكن إعادة تكوينها. تنتهي الجولة بدون فائز.",
};

type Rule = [RegExp, (m: RegExpExecArray) => string];

const n = (name: string) => localName(name);

const RULES: Rule[] = [
  [/^Opening needs (\d+) points\. These plays total (\d+)\.$/, (m) => `الفتح يحتاج إلى ${m[1]} نقطة. مجموع هذا اللعب ${m[2]}.`],
  [new RegExp(`^((?:${CARD})(?: (?:${CARD}))*) cannot be added to that (set|run)\\.$`), (m) => `لا يمكن إضافة ${cards(m[1])} إلى ${THAT_MELD_AR[m[2]]}.`],
  [/^Only the (\w+) of (clubs|diamonds|hearts|spades) can replace that joker\.$/, (m) => `لا يحل محل هذا الجوكر إلا ${rank(m[1])} من ${SUITS_AR[m[2]]}.`],
  [/^Only a (\w+) in a suit missing from the set can replace that joker\.$/, (m) => `لا يحل محل هذا الجوكر إلا ${rank(m[1])} من نوع ناقص في المجموعة.`],
  [new RegExp(`^You cannot discard (${CARD}) because it fits a meld on the table\\. Discard a card that does not fit\\.$`), (m) => `لا يمكنك رمي ${card(m[1])} لأنها تصلح لتنزيلة على الطاولة. ارمِ ورقة لا تصلح.`],
  [/^The number of jokers must be a whole number from 0 to (\d+)\.$/, (m) => `عدد الجوكر يجب أن يكون عدداً صحيحاً من 0 إلى ${m[1]}.`],

  [/^(.+) drew from the stock\.$/, (m) => `${n(m[1])} سحب من كومة السحب.`],
  [new RegExp(`^(.+) discarded (${CARD})\\.$`), (m) => `${n(m[1])} رمى ${card(m[2])}.`],
  [
    new RegExp(`^(.+) took (${CARD}) from the discard pile( and opened with (\\d+) points| and opened)?: (.+)\\.$`),
    (m) => {
      const opening = m[4] ? ` وفتح بمجموع ${m[4]} نقطة` : m[3] ? " وفتح" : "";
      return `${n(m[1])} أخذ ${card(m[2])} من كومة الرمي${opening}: ${plays(m[5])}.`;
    },
  ],
  [/^(.+) played (.+)\.$/, (m) => `${n(m[1])} نزّل: ${plays(m[2])}.`],
  [/^(.+) went out and wins round (\d+)\.$/, (m) => `${n(m[1])} أنهى أوراقه وفاز بالجولة ${m[2]}.`],
  [/^(.+) holds only jokers and passes without discarding\.$/, (m) => `${n(m[1])} ليس في يده إلا الجوكر، فمرّ دوره بدون رمي.`],
  [/^The host ended the match\. (.+) wins\.$/, (m) => `أنهى المضيف المباراة. الفائز ${n(m[1])}.`],
  [/^(.+) wins the match\.$/, (m) => `${n(m[1])} يفوز بالمباراة.`],
  [/^(Tiebreak round|Round) (\d+) begins\. (.+) deals\.$/, (m) => `${m[1] === "Round" ? "تبدأ الجولة" : "تبدأ الجولة الفاصلة"} ${m[2]}. الموزّع ${n(m[3])}.`],
  [/^The match begins\. (.+) deals\.$/, (m) => `تبدأ المباراة. الموزّع ${n(m[1])}.`],

  [/^(.+) created the room\.$/, (m) => `${m[1]} أنشأ الغرفة.`],
  [/^(.+) joined and will take (.+)'s seat next round\.$/, (m) => `${m[1]} انضم وسيأخذ مقعد ${n(m[2])} في الجولة القادمة.`],
  [/^(.+) joined\.$/, (m) => `${m[1]} انضم.`],
  [/^(.+) is back and has reclaimed the seat\.$/, (m) => `${m[1]} عاد واستعاد مقعده.`],
  [/^(.+) left\.$/, (m) => `${m[1]} غادر.`],
  [/^(.+) lost connection\.$/, (m) => `${m[1]} انقطع اتصاله.`],
  [/^(.+) reconnected\.$/, (m) => `${m[1]} عاد إلى الاتصال.`],
  [/^(.+) takes a seat with (\d+) penalty points\.$/, (m) => `${m[1]} يأخذ مقعداً برصيد ${m[2]} من نقاط الجزاء.`],
  [/^(.+) takes a seat\.$/, (m) => `${m[1]} يأخذ مقعداً.`],
  [/^A bot is playing for (.+) until they return\.$/, (m) => `روبوت يلعب مكان ${m[1]} حتى يعود.`],
  [/^A bot is playing for (.+)\. The room closes if the host does not return\.$/, (m) => `روبوت يلعب مكان ${m[1]}. تُغلق الغرفة إذا لم يعد المضيف.`],
];

/** Translates one server or engine message. English and unknown messages pass through untouched. */
export function serverText(text: string): string {
  if (getLanguage() !== "ar") return text;
  const exact = EXACT[text];
  if (exact) return exact;
  for (const [pattern, render] of RULES) {
    const match = pattern.exec(text);
    if (match) return render(match);
  }
  return text;
}
