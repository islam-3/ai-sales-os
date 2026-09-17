// Tests for unprompted photo offers.
//
// Offers fell to one reply in eighteen once the per-turn list of offerable
// titles went, and a real before-and-after is the strongest tool this
// product has. The way back is not another list: it is a computed
// suggestion that fires only when every condition is a fact. Each
// condition below has a fixture that turns it off on its own, so no single
// condition can quietly stop mattering.
//
//   npx tsx scripts/test-photo-offer.ts

import {
  buildPhotoOfferInstruction,
  decideMedia,
  suggestPhotoOffer,
  type MediaCandidate,
} from "../lib/chat-media";
import { buildConversationStateBlock, type ChatTurn } from "../lib/conversation-state";

let bad = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (!ok) {
    bad++;
    console.log(`FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const u = (c: string): ChatTurn => ({ role: "user", content: c });
const a = (c: string): ChatTurn => ({ role: "assistant", content: c });
const img = (url: string) => ({ url, type: "image/jpeg" });

const BA_IMPLANTS = "https://example.test/ba-implants.jpg";
const BA_HOLLYWOOD = "https://example.test/ba-hollywood.jpg";
const IMPLANT_BRAND = "https://example.test/implant-brand.jpg";

const CATALOGUE: MediaCandidate[] = [
  {
    title: "Before and after ( dental implants )",
    content: "Before and after results from full mouth dental implant treatment.",
    media: [img(BA_IMPLANTS)],
  },
  {
    title: "Before and after ( Hollywood smile )",
    content: "Before and after results from Hollywood smile veneer treatment.",
    media: [img(BA_HOLLYWOOD)],
  },
  {
    title: "Implants brand",
    content: "We use Implant Swiss dental implants for their Swiss precision.",
    media: [img(IMPLANT_BRAND)],
  },
  {
    title: "Dental implant treatment",
    content:
      "Dental implants take two visits: five days for placement, then a healing period of four months, then seven days for the permanent crowns, with a lifetime warranty on the implants.",
    media: [],
  },
  {
    title: "Teeth whitening",
    content: "Professional whitening in a single one-hour appointment.",
    media: [],
  },
];

// An engaged visitor on a significant case, at a moment that is not a
// question: the one situation this is for.
const ELIGIBLE: ChatTurn[] = [
  u("hi, I'm looking into full mouth dental implants"),
  a("Implants take two visits, with a healing period in between and a lifetime warranty on the implants."),
  u("I've lost most of my upper teeth and honestly I've been living without them for about ten years now"),
];

console.log("--- when it fires ---");
const offer = suggestPhotoOffer(ELIGIBLE, CATALOGUE);
check("an engaged visitor on a significant case is offered a photo", offer !== null);
check(
  "it is the photo relevant to what they came for",
  offer?.title === "Before and after ( dental implants )",
  JSON.stringify(offer)
);

console.log("\n--- each condition turns it off on its own ---");
check(
  "not on the first visitor message",
  suggestPhotoOffer([u("hi, I'm looking into full mouth dental implants")], CATALOGUE) === null
);
check(
  "not when their latest message is a question",
  suggestPhotoOffer([...ELIGIBLE.slice(0, 2), u("how long does the whole thing take for someone like me?")], CATALOGUE) === null
);
check(
  "not while they are impatient",
  suggestPhotoOffer([...ELIGIBLE.slice(0, 2), u("I ASKED about my upper teeth, still waiting")], CATALOGUE) === null
);
check(
  "not while they are hesitating",
  suggestPhotoOffer([...ELIGIBLE.slice(0, 2), u("I'm not sure yet, I need to think about it with my family")], CATALOGUE) === null
);
check(
  "not for a small booking",
  suggestPhotoOffer(
    [
      u("hi, I'm interested in teeth whitening"),
      a("Whitening is a single one-hour appointment."),
      u("that sounds good, I'd like my teeth a little brighter for a wedding next month"),
    ],
    CATALOGUE
  ) === null
);
check(
  "not once contact details are in",
  suggestPhotoOffer([...ELIGIBLE, a("Thanks."), u("my number is +44 7700 900123 and I'm very keen")], CATALOGUE) === null
);
check(
  "not when either of the last two replies made an offer",
  suggestPhotoOffer(
    [
      ...ELIGIBLE.slice(0, 2),
      u("that sounds interesting, it has been a long road"),
      a("Would you like to see the implant brand we use?"),
      u("maybe later, I'm mostly thinking about how it will look in the end"),
    ],
    CATALOGUE
  ) === null
);
check(
  "not when every relevant photo has been shown",
  suggestPhotoOffer(ELIGIBLE, CATALOGUE, new Set([BA_IMPLANTS, IMPLANT_BRAND])) === null
);

console.log("\n--- relevance and repetition ---");
check(
  "an implant patient is never offered the Hollywood-smile cases",
  suggestPhotoOffer(ELIGIBLE, CATALOGUE, new Set([BA_IMPLANTS, IMPLANT_BRAND])) === null
);
const veneers = suggestPhotoOffer(
  [
    u("hi, I want a full hollywood smile, veneers on all my front teeth"),
    a("A Hollywood smile takes two visits with a healing period between them."),
    u("I've hated my smile in photos for years, I just want it done properly this time"),
  ],
  CATALOGUE
);
check("a veneers patient is offered the Hollywood-smile case", veneers?.title === "Before and after ( Hollywood smile )", JSON.stringify(veneers));

const earlierOffered = [
  ...ELIGIBLE.slice(0, 2),
  u("that makes sense, it has been a long road"),
  a("Would you like to see some before and after photos of our dental implant cases?"),
  u("not right now thanks"),
  a("Of course. Most patients find the first visit is the hardest part."),
  u("yes that sounds about right, it all feels like a lot to take in honestly"),
  // One more exchange, so the earlier offer is outside the two-reply
  // spacing window and only the no-repeat rule is being tested.
  a("It is a lot, and it is completely normal to feel that way at this stage."),
  u("that's reassuring to hear, I've put this off for a long time now"),
];
const next = suggestPhotoOffer(earlierOffered, CATALOGUE);
check(
  "a photo offered earlier is not offered again, however it was worded",
  next?.title !== "Before and after ( dental implants )",
  JSON.stringify(next)
);
check("the next relevant photo is offered instead", next?.title === "Implants brand", JSON.stringify(next));

console.log("\n--- what the model is told ---");
const instruction = buildPhotoOfferInstruction(offer)!;
check("no suggestion, no instruction", buildPhotoOfferInstruction(null) === null);
check("it is framed as an offer, closing the reply", /close this reply by offering to show it/.test(instruction));
check("the label is never to be repeated", /Never repeat that label to them/.test(instruction));
check("it must name the subject plainly, so acceptance can resolve", /naming plainly what it shows/.test(instruction));
check("it never claims the photo is present", /attached only if they say yes/.test(instruction));

console.log("\n--- in the state block ---");
const block = buildConversationStateBlock(ELIGIBLE, CATALOGUE, null, instruction) ?? "";
check("the instruction reaches the block", block.includes("has not been shown or offered yet"));

const hesitant = [...ELIGIBLE.slice(0, 2), u("I need to think about it")];
check(
  "the block drops it while a brake is on, even if handed one",
  !(buildConversationStateBlock(hesitant, CATALOGUE, null, instruction) ?? "").includes("has not been shown or offered yet")
);

const moulded = (n: number) => `${"word ".repeat(n)}.\n\n${"word ".repeat(n)} what matters most to you?`;
const repeating = [
  u("hi, I'm looking into full mouth dental implants"),
  a(moulded(25)),
  u("ok"),
  a(moulded(30)),
  u("I've lost most of my upper teeth and honestly I've been living without them for ten years"),
];
const both = buildConversationStateBlock(repeating, CATALOGUE, null, instruction) ?? "";
check("with a repeated shape, the offer is the change of shape", both.includes("has not been shown or offered yet"));
// The nudge is KEPT, with the offer as its exception. Dropping it whenever
// an offer was merely suggested raised question endings from 56% to 69%
// across two samples, because the model only sometimes takes the
// suggestion up and the nudge had gone on every turn it did not.
check(
  "the shape note still asks for a statement ending",
  /same shape as each other/.test(both) && /end it on a statement rather than a question/i.test(both),
  both.split("\n").filter((l) => /shape/.test(l)).join(" | ")
);
check("with the photo offer as its one exception", /unless you close with the photo offer described below/.test(both));
const noOffer = buildConversationStateBlock(repeating, CATALOGUE, null, null) ?? "";
check(
  "without an offer there is no exception to mention",
  /end it on a statement rather than a question/i.test(noOffer) && !/unless you close with the photo offer/.test(noOffer)
);

console.log("\n--- acceptance of a plainly-worded offer resolves to that photo ---");
// The offer only works if saying yes gets the photo it named. This pins
// the wording the instruction asks for against the real decision.
const accepted = decideMedia(
  [
    ...ELIGIBLE,
    a("That's a long time to manage. Would you like to see a before and after from one of our full mouth dental implant cases?"),
    u("yes please"),
  ],
  CATALOGUE
);
check(
  "yes to a plainly named offer sends the offered photo",
  accepted.send && accepted.url === BA_IMPLANTS,
  JSON.stringify(accepted)
);

console.log(bad ? `\n${bad} FAILING` : "\nall photo-offer tests passed");
process.exit(bad ? 1 : 0);
