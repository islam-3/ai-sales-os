// Branch tests for the media decision.
//
// decideMedia is a pure function of (history, entries, alreadySent), and
// these fixtures reach every branch of it. That is the point of the
// redesign: the previous pipeline could only be exercised by replaying
// real conversations against the model, where wording varies run to run,
// so a lucky pass hid defects — including an entire test suite that ran
// against a tenant with no images at all.
//
// The catalogue below is synthetic and fixed, so a failure here is a
// change in the decision logic and never a change in someone's data.
//
//   npx tsx scripts/test-media-decision.ts

import {
  buildMediaInstruction,
  decideMedia,
  type MediaCandidate,
  type MediaDecision,
} from "../lib/chat-media";
import type { ChatTurn } from "../lib/conversation-state";

const BA_1 = "https://example.test/before-after-1.jpg";
const BA_2 = "https://example.test/before-after-2.jpg";
const HOLLYWOOD = "https://example.test/hollywood-smile.jpg";
const IMPLANT = "https://example.test/implant-swiss.jpg";
const CROWN = "https://example.test/straumann-crown.jpg";

const img = (url: string) => ({ url, type: "image/jpeg" });

/** A realistic catalogue: nine entries, four of which carry photos. */
const CATALOGUE: MediaCandidate[] = [
  {
    title: "Before and after ( dental implants )",
    content:
      "Before and after results from full mouth dental implant treatment carried out at our clinic.",
    media: [img(BA_1), img(BA_2)],
  },
  {
    // The real catalogue contains three entries titled some variant of
    // "Before and after". A fixture with only one cannot reproduce the
    // collision that sent a Hollywood-smile case to an implant patient,
    // so it is reproduced here.
    title: "Before and after ( Hollywood smile )",
    content:
      "Before and after results from Hollywood smile veneer treatment carried out at our clinic.",
    media: [img(HOLLYWOOD)],
  },
  {
    title: "We use Implant Swiss dental implants",
    content:
      "We use Implant Swiss dental implants for their exceptional quality, Swiss precision and proven long-term success rates.",
    media: [img(IMPLANT)],
  },
  {
    title: "We use premium Straumann zirconia crowns",
    content:
      "Straumann zirconia crowns are known for their natural appearance, strength and durability over many years.",
    media: [img(CROWN)],
  },
  {
    title: "Fifteen years of experience",
    content: "Our team has fifteen years of experience treating international patients.",
    media: [],
  },
  {
    title: "Payment plans and financing",
    content: "We offer flexible payment plans and financing options to spread the cost.",
    media: [],
  },
  {
    title: "Hotel and airport transfer package",
    content: "Your package includes hotel accommodation and airport transfers during your stay.",
    media: [],
  },
  {
    title: "Teeth whitening",
    content: "Professional whitening brightens your smile in a single visit.",
    media: [],
  },
  {
    title: "Sedation and comfort",
    content: "We offer sedation options so that treatment stays comfortable and painless.",
    media: [],
  },
];

/** The same catalogue with every photo removed — the demo-clinic shape. */
const NO_MEDIA_CATALOGUE: MediaCandidate[] = CATALOGUE.map((e) => ({ ...e, media: [] }));

const user = (content: string): ChatTurn => ({ role: "user", content });
const bot = (content: string): ChatTurn => ({ role: "assistant", content });

// An offer sentence at the end of a long, unrelated paragraph. This exact
// shape is what used to send the crowns photo when the visitor accepted an
// offer of a before-and-after: matching the whole previous message
// overlapped the crowns entry far more than the before-and-after one.
const BURIED_OFFER = bot(
  "Straumann zirconia crowns give a very natural appearance, and their strength and durability mean they hold up for many years even at the back of the mouth. I can show you a before-and-after from one of our patients if you like."
);

type Case = {
  name: string;
  history: ChatTurn[];
  entries?: MediaCandidate[];
  sent?: string[];
  expect: { send: false; reason: string } | { send: true; url: string; reason: string };
};

const cases: Case[] = [
  // ── no request ────────────────────────────────────────────────────
  {
    name: "empty conversation",
    history: [],
    expect: { send: false, reason: "no-request" },
  },
  {
    name: "visitor is just chatting",
    history: [bot("We have fifteen years of experience."), user("that's good to know")],
    expect: { send: false, reason: "no-request" },
  },
  {
    name: "'yes' with no offer on the table sends nothing",
    history: [bot("What brings you to us today?"), user("yes")],
    expect: { send: false, reason: "no-request" },
  },
  {
    name: "'yes' after a plain statement is not an acceptance of anything",
    history: [
      bot("Our team has fifteen years of experience treating international patients."),
      user("yes"),
    ],
    expect: { send: false, reason: "no-request" },
  },
  {
    name: "declining an offer sends nothing",
    history: [bot("I can show you a before-and-after if you like."), user("no thanks")],
    expect: { send: false, reason: "no-request" },
  },
  {
    name: "a question about photos the visitor would send is not a request to see one",
    history: [bot("Could you send a photo of your teeth?"), user("I'll send one tomorrow")],
    expect: { send: false, reason: "no-request" },
  },

  // ── accepted offer ────────────────────────────────────────────────
  {
    name: "offer then accept sends the offered image",
    history: [user("I've lost most of my upper teeth and I'm looking at dental implants"), bot("I can show you a before-and-after if you like."), user("yes")],
    expect: { send: true, url: BA_1, reason: "accepted-offer" },
  },
  {
    name: "the OFFER SENTENCE defines the subject, not the whole message",
    history: [user("I've lost most of my upper teeth and I'm looking at dental implants"), BURIED_OFFER, user("yes please")],
    expect: { send: true, url: BA_1, reason: "accepted-offer" },
  },
  {
    // "Want to take a look?" is read as an OFFER awaiting acceptance
    // rather than as a description of something already sent — and then
    // it stops, because "the implants themselves" scores identically
    // against the before-and-after entry and the Implant Swiss entry.
    //
    // The surrounding message names Implant Swiss and would settle it,
    // but the offer sentence DID name a subject, so widening is refused:
    // a wider reading may only resolve a subject the offer sentence
    // failed to name, never replace an ambiguous one. The visitor has
    // also said nothing revealing what they came for. Nothing is sent.
    name: "an ambiguous offer is not rescued by widening the search",
    history: [
      bot("We use Implant Swiss dental implants for their Swiss precision. Want to take a look at the implants themselves?"),
      user("sure"),
    ],
    expect: { send: false, reason: "no-confident-match" },
  },
  {
    // THE case that prompted the rewrite. Two entries are titled "Before
    // and after"; the request cannot separate them; the visitor spent the
    // whole conversation talking about implants. The old code broke the
    // tie on database order and sent the Hollywood smile.
    name: "an implant patient asking for before-and-afters gets the implant case",
    history: [
      user("I've lost most of my upper teeth and I'm looking at dental implants"),
      bot("That's very treatable."),
      user("can I see some before and afters?"),
    ],
    expect: { send: true, url: BA_1, reason: "direct-request" },
  },
  {
    // The mirror image, to prove the tie-break is reading the visitor and
    // not just preferring whichever entry comes first.
    name: "a veneers patient asking the same question gets the Hollywood case",
    history: [
      user("I want a hollywood smile, veneers on my front teeth"),
      bot("Lovely."),
      user("can I see some before and afters?"),
    ],
    expect: { send: true, url: HOLLYWOOD, reason: "direct-request" },
  },
  {
    // And with nothing to go on, nothing is sent. This is the branch that
    // makes the two above safe rather than lucky.
    name: "a visitor who has revealed nothing gets no before-and-after at all",
    history: [bot("Can I show you a before-and-after?"), user("yes")],
    expect: { send: false, reason: "no-confident-match" },
  },
  {
    // The live failure the invariant exists for. The offer plainly says
    // before-and-after; the message around it is all crowns. Whatever
    // happens, the crowns photo is the wrong answer.
    name: "a before-and-after offer never yields the crowns photo around it",
    history: [
      user("I've lost most of my upper teeth and I'm looking at dental implants"),
      bot("We use premium Straumann zirconia crowns, known worldwide for their natural appearance, strength and durability over many years. Would you like to see some before and after photos of implant cases we have done?"),
      user("yes"),
    ],
    expect: { send: true, url: BA_1, reason: "accepted-offer" },
  },
  {
    // The live failure this fallback exists for: the offer sentence is
    // anaphoric, and "they" is doing all the work.
    name: "an anaphoric offer resolves through the sentence before it",
    history: [
      bot("We use premium Straumann zirconia crowns for their natural appearance. Would you like to see what they actually look like up close?"),
      user("yes"),
    ],
    expect: { send: true, url: CROWN, reason: "accepted-offer" },
  },
  {
    // The fallback must not undo the narrowing it sits behind: this
    // message is mostly about crowns, but the offer is unambiguously a
    // before-and-after, so the narrow reading wins and the wider one is
    // never consulted.
    name: "the fallback never overrides an offer sentence that already resolved",
    history: [user("I've lost most of my upper teeth and I'm looking at dental implants"), BURIED_OFFER, user("ok")],
    expect: { send: true, url: BA_1, reason: "accepted-offer" },
  },
  {
    name: "'want to take a look?' with an unambiguous subject does send",
    history: [
      bot("Straumann zirconia crowns look very natural. Want to take a look at the crowns?"),
      user("sure"),
    ],
    expect: { send: true, url: CROWN, reason: "accepted-offer" },
  },
  {
    name: "an offer about crowns sends the crowns photo",
    history: [bot("I can show you the Straumann zirconia crowns we use."), user("go on")],
    expect: { send: true, url: CROWN, reason: "accepted-offer" },
  },
  {
    name: "'ok' counts as acceptance",
    history: [user("I've lost most of my upper teeth and I'm looking at dental implants"), bot("Would you like to see a before-and-after?"), user("ok")],
    expect: { send: true, url: BA_1, reason: "accepted-offer" },
  },
  {
    // DELIBERATE LIMITATION, not a defect. Only the immediately preceding
    // assistant turn is searched for an offer. Here the visitor detoured,
    // got an answer, and came back to an offer that is now two turns old,
    // so "that" no longer has anything to bind to and nothing is sent.
    //
    // Scanning further back would reconnect this, at the cost of letting a
    // stale offer be revived by an unrelated "yes" much later on — which
    // is the class of rule this redesign exists to remove. Left
    // conservative on purpose; reinstate deliberately if it matters.
    name: "an offer two turns back has gone stale and sends nothing",
    history: [
      bot("I can show you a before-and-after if you like."),
      user("how long does it take?"),
      bot("Most cases are finished in two visits over about ten days."),
      user("yes I'd like to see that"),
    ],
    expect: { send: false, reason: "no-confident-match" },
  },

  {
    // Live failure: this phrasing is in no cue list, and enumerating
    // phrasings is a losing game. A question inviting the visitor to look
    // at something is an offer whatever words it uses.
    name: "an offer phrased in a way no cue list anticipated still counts",
    history: [
      user("I've lost most of my upper teeth and I'm looking at dental implants"),
      bot("The crowns we use are Straumann zirconia. Would it help to see some before and after photos from actual implant cases we've done?"),
      user("yes"),
    ],
    expect: { send: true, url: BA_1, reason: "accepted-offer" },
  },
  {
    // The boundary that keeps the general rule honest: a question about
    // photographs where the VISITOR does the sending is not an offer, and
    // agreeing to it must not attach anything.
    name: "being asked to send a photo is not an offer to show one",
    history: [
      user("I've lost most of my upper teeth and I'm looking at dental implants"),
      bot("Could you send a photo of your teeth?"),
      user("yes"),
    ],
    expect: { send: false, reason: "no-request" },
  },

  // ── responding to an offer without saying "yes" ───────────────────
  {
    // The live failure: the visitor names which half of a two-option
    // offer they want. No cue list calls this an acceptance, so four
    // turns produced promises and no picture.
    name: "naming part of an offer counts as taking it up",
    history: [
      user("I want implants"),
      bot("Would you like to see the crowns we use?"),
      user("the crowns"),
    ],
    expect: { send: true, url: CROWN, reason: "accepted-offer" },
  },
  {
    // A named selection must NARROW the offer, not merely unlock it.
    // Resolving this against the offer sentence sent a before-and-after
    // to someone who had just said they wanted the brands.
    name: "an ambiguous selection sends nothing rather than the other half",
    history: [
      user("I want implants"),
      bot("Would you like to see some before and after photos, or the implant/crown brands we use?"),
      user("the brands"),
    ],
    expect: { send: false, reason: "no-confident-match" },
  },
  {
    // The guard that keeps the above from swallowing a change of subject.
    name: "changing the subject after an offer is not taking it up",
    history: [
      user("I want implants"),
      bot("Would you like to see the crowns we use?"),
      user("how much does it cost?"),
    ],
    expect: { send: false, reason: "no-request" },
  },
  {
    name: "an offer ending in an exclamation still registers as an offer",
    history: [
      user("I've lost most of my upper teeth and I'm looking at dental implants"),
      bot("I would love to show you some before-and-afters!"),
      user("yes"),
    ],
    expect: { send: true, url: BA_1, reason: "accepted-offer" },
  },
  {
    // Broadening the offer test must not swallow the opposite direction:
    // here the clinic is asking the VISITOR for a photo.
    name: "'show me a photo of your teeth' is still not an offer",
    history: [user("hi"), bot("Could you show me a photo of your teeth?"), user("yes")],
    expect: { send: false, reason: "no-request" },
  },

  {
    // "Both" is agreement, not ambiguity. Reading it as ambiguity is what
    // classified a plain acceptance as no request at all, left the model
    // holding a contradiction, and ended with the entire state block
    // being recited to a visitor.
    name: "accepting a whole multi-option offer sends the strongest match",
    history: [
      user("I want implants"),
      bot("Would you like to see the crowns we use, or a before-and-after?"),
      user("both"),
    ],
    expect: { send: true, url: CROWN, reason: "accepted-offer" },
  },
  {
    name: "'all of them' works the same way",
    history: [
      user("I want implants"),
      bot("Would you like to see the crowns we use, or a before-and-after?"),
      user("all of them please"),
    ],
    expect: { send: true, url: CROWN, reason: "accepted-offer" },
  },
  {
    // The distinction the whole module rests on. Naming ONE thing that
    // several entries could be is still ambiguity, and still sends
    // nothing - accepting everything must not weaken that.
    name: "accepting everything does not license guessing elsewhere",
    history: [bot("Can I show you a before-and-after?"), user("yes")],
    expect: { send: false, reason: "no-confident-match" },
  },
  {
    // Caught live, after the accept-all change: a full-mouth implant
    // patient said "both" to an offer naming before-and-afters, and got
    // the HOLLYWOOD SMILE case. Accepting every option settles which
    // option was wanted; it does not settle which of three entries
    // titled "Before and after" was meant. The conversation still does.
    // The crowns entry wins this offer outright, so it goes first. What
    // matters is that the before-and-afters are reported as still to
    // come, in the order the VISITOR would want them - asserted on
    // alsoAvailable below.
    name: "accepting everything sends the strongest match first",
    history: [
      user("I'm looking at full mouth dental implants, I've lost most of my upper teeth"),
      bot("Would you like to see the crowns we use, or a before-and-after?"),
      user("both"),
    ],
    expect: { send: true, url: CROWN, reason: "accepted-offer" },
  },
  {
    // The same ambiguity, settled by the conversation rather than by
    // score: an offer naming only before-and-afters cannot say WHICH.
    name: "accepting everything still never overrides what the visitor came for",
    history: [
      user("I'm looking at full mouth dental implants, I've lost most of my upper teeth"),
      bot("Would you like to see a before-and-after from one of our cases?"),
      user("both"),
    ],
    expect: { send: true, url: BA_1, reason: "accepted-offer" },
  },
  {
    name: "the same offer to a veneers patient resolves the other way",
    history: [
      user("I want a hollywood smile, veneers on my front teeth"),
      bot("Would you like to see a before-and-after from one of our cases?"),
      user("both"),
    ],
    expect: { send: true, url: HOLLYWOOD, reason: "accepted-offer" },
  },
  {
    name: "'both' with no offer on the table is not a request",
    history: [user("I want implants"), bot("What brings you in?"), user("both")],
    expect: { send: false, reason: "no-request" },
  },

  // ── the case that burned us: matched entry exhausted ───────────────
  {
    name: "matched entry fully spent sends NOTHING, never another entry's photo",
    history: [user("I've lost most of my upper teeth and I'm looking at dental implants"), BURIED_OFFER, user("yes")],
    sent: [BA_1, BA_2],
    expect: { send: false, reason: "already-shown" },
  },
  {
    name: "matched entry partly spent sends the OTHER image from the SAME entry",
    history: [user("I've lost most of my upper teeth and I'm looking at dental implants"), bot("I can show you another before-and-after."), user("yes please")],
    sent: [BA_1],
    expect: { send: true, url: BA_2, reason: "accepted-offer" },
  },
  {
    name: "an unrelated photo being unsent does not rescue an exhausted match",
    history: [user("I've lost most of my upper teeth and I'm looking at dental implants"), bot("Can I show you a before-and-after?"), user("yes")],
    sent: [BA_1, BA_2],
    expect: { send: false, reason: "already-shown" },
  },
  {
    name: "a direct request for something already shown sends nothing",
    history: [user("I've lost most of my upper teeth and I'm looking at dental implants"), user("can I see some before and afters?")],
    sent: [BA_1, BA_2],
    expect: { send: false, reason: "already-shown" },
  },

  // ── vague offers ──────────────────────────────────────────────────
  {
    name: "vague offer with no confident match sends nothing",
    history: [bot("Would you like to see some examples?"), user("yes")],
    expect: { send: false, reason: "no-confident-match" },
  },
  {
    name: "'shall I show you something?' is too vague to resolve",
    history: [bot("Shall I show you something?"), user("sure")],
    expect: { send: false, reason: "no-confident-match" },
  },

  // ── direct requests ───────────────────────────────────────────────
  {
    name: "unprompted direct request is honoured",
    history: [user("I've lost most of my upper teeth and I'm looking at dental implants"), user("can I see some before and afters?")],
    expect: { send: true, url: BA_1, reason: "direct-request" },
  },
  {
    name: "'show me' unprompted is honoured",
    history: [
      bot("Straumann zirconia crowns look very natural."),
      user("show me the crowns"),
    ],
    expect: { send: true, url: CROWN, reason: "direct-request" },
  },
  {
    name: "'do you have any photos of the implants' is honoured",
    history: [user("do you have any photos of the implants you use?")],
    expect: { send: true, url: IMPLANT, reason: "direct-request" },
  },
  {
    name: "direct request for something not on file sends nothing",
    history: [user("can I see a photo of your clinic building?")],
    expect: { send: false, reason: "no-confident-match" },
  },
  {
    name: "direct request wins when there is no offer to interpret it against",
    history: [user("I've lost most of my upper teeth and I'm looking at dental implants"), bot("What brings you in?"), user("show me before and after pictures")],
    expect: { send: true, url: BA_1, reason: "direct-request" },
  },

  // ── an offer reinterprets a request that would otherwise match ─────
  {
    name: "'show me' right after an offer is read as accepting THAT offer",
    history: [
      user("I've lost most of my upper teeth and I'm looking at dental implants"),
      BURIED_OFFER,
      user("yes, show me"),
    ],
    expect: { send: true, url: BA_1, reason: "accepted-offer" },
  },

  // ── no media in the catalogue at all ──────────────────────────────
  {
    name: "a tenant with no photos sends nothing on acceptance",
    history: [user("I've lost most of my upper teeth and I'm looking at dental implants"), bot("I can show you a before-and-after."), user("yes")],
    entries: NO_MEDIA_CATALOGUE,
    expect: { send: false, reason: "no-media" },
  },
  {
    name: "a tenant with no photos sends nothing on a direct request",
    history: [user("can I see some before and afters?")],
    entries: NO_MEDIA_CATALOGUE,
    expect: { send: false, reason: "no-media" },
  },
  {
    name: "an empty catalogue sends nothing",
    history: [user("can I see some before and afters?")],
    entries: [],
    expect: { send: false, reason: "no-media" },
  },
];

let failures = 0;

for (const testCase of cases) {
  const decision = decideMedia(
    testCase.history,
    testCase.entries ?? CATALOGUE,
    new Set(testCase.sent ?? [])
  );

  const expected = testCase.expect;
  let ok: boolean;
  let got: string;

  if (expected.send) {
    ok =
      decision.send === true &&
      decision.url === expected.url &&
      decision.reason === expected.reason;
    got = decision.send
      ? `send ${decision.url.split("/").pop()} (${decision.reason})`
      : `NOTHING (${decision.reason})`;
  } else {
    ok = decision.send === false && decision.reason === expected.reason;
    got = decision.send
      ? `send ${decision.url.split("/").pop()} (${decision.reason})`
      : `NOTHING (${decision.reason})`;
  }

  if (!ok) failures++;
  const want = expected.send
    ? `send ${expected.url.split("/").pop()} (${expected.reason})`
    : `NOTHING (${expected.reason})`;

  console.log(`${ok ? "  ok  " : "FAIL  "}${testCase.name}`);
  if (!ok) console.log(`        wanted ${want}\n           got ${got}`);
}

// Determinism: the same inputs must always produce the same image. The old
// ranking could reorder on ties, which is how a repeat run "passed".
const a = decideMedia([bot("I can show you a before-and-after."), user("yes")], CATALOGUE);
const b = decideMedia([bot("I can show you a before-and-after."), user("yes")], CATALOGUE);
const deterministic = JSON.stringify(a) === JSON.stringify(b);
if (!deterministic) failures++;
console.log(`${deterministic ? "  ok  " : "FAIL  "}the same inputs always produce the same image`);

// ────────────────────────────────────────────────────────────────────
// buildMediaInstruction
//
// The decision above was exhaustively tested and the instruction derived
// from it was not tested at all — which is exactly where the four-turn
// failure lived. The decision correctly sent nothing; the model was told
// only what it MAY offer, with no statement that the reply carried no
// image. It answered "the brands" with "Here you go!", then promised the
// crowns "will follow right after". Both were unkeepable.
//
// The invariant: either an image is attached, or the model is told in so
// many words that none is and none is coming.
// ────────────────────────────────────────────────────────────────────

let iFail = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (!ok) {
    iFail++;
    console.log(`FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

/** Does this instruction state plainly that nothing is attached or coming? */
const warnsNothingComing = (s: string | null) =>
  !!s && /THIS REPLY CARRIES NO IMAGE, and none is being sent\./.test(s);

const TITLES = ["Before and after ( dental implants )", "We use Implant Swiss dental implants"];

console.log("\n--- buildMediaInstruction ---");



const sendDecision: MediaDecision = {
  send: true,
  url: BA_1,
  type: "image/jpeg",
  title: "Before and after ( dental implants )",
  alsoAvailable: [],
  reason: "accepted-offer",
};
const sendInstr = buildMediaInstruction(sendDecision, TITLES)!;
check("attach: names what the image shows", sendInstr.includes("Before and after ( dental implants )"));
check("attach: says an image IS attached", /AN IMAGE IS ATTACHED/.test(sendInstr));
check("attach: does not also claim nothing is attached", !warnsNothingComing(sendInstr));

const multi = buildMediaInstruction(
  {
    send: true,
    url: BA_1,
    type: "image/jpeg",
    title: "Crowns brand",
    alsoAvailable: ["Before and after ( dental implants )"],
    reason: "accepted-offer",
  },
  TITLES
)!;
check("multi-option: names the image that IS attached", /It shows: "Crowns brand"/.test(multi));
check("multi-option: says one image goes per reply", /ONE image goes per reply/.test(multi));
check("multi-option: lists what remains", multi.includes("Before and after ( dental implants )"));
check("multi-option: frames the rest as an offer, not a promise", /not as a promise/i.test(multi));
check("multi-option: does not claim nothing is attached", !warnsNothingComing(multi));
// What "also available" reports, from a real decision rather than a literal.
const bothDecision = decideMedia(
  [
    user("I'm looking at full mouth dental implants, I've lost most of my upper teeth"),
    bot("Would you like to see the crowns we use, or a before-and-after?"),
    user("both"),
  ],
  CATALOGUE
);
check(
  "accept-all: something is reported as still to come",
  bothDecision.send && bothDecision.alsoAvailable.length > 0
);
check(
  "accept-all: the rest are ordered by what the visitor came for",
  bothDecision.send && bothDecision.alsoAvailable[0] === "Before and after ( dental implants )",
  bothDecision.send ? JSON.stringify(bothDecision.alsoAvailable) : "did not send"
);
check(
  "accept-all: what was just sent is not offered again",
  bothDecision.send && !bothDecision.alsoAvailable.includes(bothDecision.title)
);
check(
  "accept-all: an off-treatment entry is not offered on",
  bothDecision.send && !bothDecision.alsoAvailable.some((tt) => /hollywood/i.test(tt)),
  bothDecision.send ? JSON.stringify(bothDecision.alsoAvailable) : "did not send"
);
// ...but scoping must not strip the list bare when nothing is on-topic.
const offTopicOnly = decideMedia(
  [
    user("I want a hair transplant"),
    bot("Would you like to see the crowns we use, or the implants?"),
    user("both"),
  ],
  CATALOGUE
);
check(
  "accept-all: nothing on-topic keeps what the offer named",
  !offTopicOnly.send || offTopicOnly.alsoAvailable.length > 0,
  offTopicOnly.send ? JSON.stringify(offTopicOnly.alsoAvailable) : "did not send"
);
const singleDecision = decideMedia(
  [user("I want implants"), bot("Would you like to see the crowns we use?"), user("yes")],
  CATALOGUE
);
check(
  "a plain single-option acceptance reports nothing further",
  singleDecision.send && singleDecision.alsoAvailable.length === 0
);
check(
  "a single-image send says nothing about others",
  !/ONE image goes per reply/.test(buildMediaInstruction(sendDecision, TITLES)!)
);


// Every non-send reason, with and without offerable titles to list.
const NON_SEND: MediaDecision["reason"][] = [
  "no-request",
  "no-media",
  "no-confident-match",
  "already-shown",
];

for (const reason of NON_SEND) {
  for (const titles of [[] as string[], TITLES]) {
    const instr = buildMediaInstruction({ send: false, reason } as MediaDecision, titles);
    check(
      `${reason} (${titles.length} offerable): warns nothing is attached or coming`,
      warnsNothingComing(instr),
      `got: ${instr === null ? "null" : JSON.stringify(instr.slice(0, 64))}`
    );
  }
}

// The exact phrasings that reached visitors.
const noReq = buildMediaInstruction({ send: false, reason: "no-request" }, TITLES)!;
check("forbids \"here you go\"", /here you go/i.test(noReq));
check("forbids promising an image in a later message", /follow right after|later message/i.test(noReq));
check("still permits making an offer", /You may OFFER/.test(noReq));
check("separates an offer from a delivery", /a question, not a delivery/i.test(noReq));
check("forbids relaying the instruction to the visitor", /never say it to them/i.test(noReq));
check("forbids explaining how images work", /never explain how images work/i.test(noReq));

// No instruction may ever leak a URL to a model that cannot send images.
for (const reason of NON_SEND) {
  const instr = buildMediaInstruction({ send: false, reason } as MediaDecision, TITLES);
  check(`${reason}: leaks no URL`, !instr || !/https?:\/\//i.test(instr));
}
check("attach: leaks no URL", !/https?:\/\//i.test(sendInstr));

// ── End to end: the live failure, decision and instruction together ──
const OFFER_MENU = bot(
  "Would you like to see some before and after photos, or the implant/crown brands we use?"
);
const liveFailure: [string, ChatTurn[]][] = [
  ["the brands", [user("I'm looking at implants"), OFFER_MENU, user("the brands")]],
  [
    "where?",
    [user("I'm looking at implants"), OFFER_MENU, user("the brands"), bot("Here you go!"), user("where?")],
  ],
  [
    "both",
    [
      user("I'm looking at implants"), OFFER_MENU, user("the brands"), bot("Here you go!"), user("where?"),
      bot("Apologies - let me share those properly. Would you prefer the implant brand or the crown brand first?"),
      user("both"),
    ],
  ],
  [
    "okay",
    [
      user("I'm looking at implants"), OFFER_MENU, user("the brands"), bot("Here you go!"), user("where?"),
      bot("Apologies - let me share those properly. Would you prefer the implant brand or the crown brand first?"),
      user("both"),
      bot("Let's start with the implants - and the crowns will follow right after!"),
      user("okay"),
    ],
  ],
];

for (const [label, history] of liveFailure) {
  const d = decideMedia(history, CATALOGUE, new Set());
  const instr = buildMediaInstruction(d, TITLES);
  check(
    `live failure "${label}": image attached, or told none is coming`,
    d.send || warnsNothingComing(instr),
    `decision=${d.send ? "send" : d.reason}`
  );
}

console.log(
  `\n${cases.length + 1 - failures}/${cases.length + 1} decision tests passed` +
    (failures ? `  — ${failures} FAILING` : "")
);
console.log(
  iFail === 0 ? "all instruction tests passed" : `instruction tests — ${iFail} FAILING`
);
process.exit(failures + iFail ? 1 : 0);
