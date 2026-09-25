// The offer the server remembers making.
//
//   npx tsx scripts/test-pending-offer.ts

import { isAffirmative } from "../lib/affirmative";
import { acceptedOffer, offerIsLive, parsePendingOffer } from "../lib/pending-offer";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const offer = { entryId: "e1", title: "Before and after gallery", offeredOnTurn: 3 };

console.log("--- an offer lives exactly one turn ---");
check("live on the very next turn", offerIsLive(offer, 4));
check("not on the turn it was made", !offerIsLive(offer, 3));
check("not two turns later", !offerIsLive(offer, 5));
check("not five turns later", !offerIsLive(offer, 8));
check("no offer is never live", !offerIsLive(null, 4));

console.log("\n--- accepting it ---");
const accept = (turn: number, text: string) => acceptedOffer(offer, turn, text, isAffirmative);
check("a yes on the next turn takes it up", accept(4, "yes please")?.entryId === "e1");
check("in Arabic too", accept(4, "نعم من فضلك")?.entryId === "e1");
check("in Chinese too", accept(4, "好的")?.entryId === "e1");
check("a no does not", accept(4, "no thanks") === null);
check("in Arabic either", accept(4, "لا شكراً") === null);

console.log("\n--- and the stale-offer bug cannot come back ---");
// The failure this whole mechanism exists to prevent: an offer made
// several turns ago, taken up by a "yes" that was answering something
// else entirely, sending a photo nobody asked for.
check(
  "a yes two turns later takes nothing",
  accept(6, "yes") === null,
  "this is the original bug wearing a new hat"
);
check("a yes on the same turn takes nothing", accept(3, "yes") === null);
check(
  "and an unrelated yes with no offer at all takes nothing",
  acceptedOffer(null, 4, "yes", isAffirmative) === null
);

console.log("\n--- reading it back from storage ---");
check("a whole row parses", parsePendingOffer(offer)?.entryId === "e1");
check("a row with no id is refused", parsePendingOffer({ title: "x", offeredOnTurn: 1 }) === null);
check("a row with no turn is refused", parsePendingOffer({ entryId: "e1", title: "x" }) === null);
check("null is refused", parsePendingOffer(null) === null);
check("a string is refused", parsePendingOffer("nonsense") === null);
check(
  "turn zero is still a turn",
  parsePendingOffer({ entryId: "e1", title: "x", offeredOnTurn: 0 })?.offeredOnTurn === 0,
  "falsy but valid - the greeting turn"
);

console.log("\n--- what this removes ---");
// Nothing here reads the assistant's words, the visitor's words beyond
// "is it a yes", or any knowledge-base title. That is the point: the
// entry was known when the offer was made, so no language is involved in
// working out which one it was.
const source = require("fs").readFileSync("lib/pending-offer.ts", "utf8") as string;
check(
  "no entry titles are matched against anything",
  !/match|includes|indexOf|test\(/.test(source.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")),
  "re-identifying the entry from text is exactly what scored 17%"
);

console.log(bad ? `\n${bad} FAILING` : "\nall pending-offer tests passed");
process.exit(bad ? 1 : 0);
