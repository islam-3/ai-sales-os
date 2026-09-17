// Calibration for MEDIA_MATCH_THRESHOLD and MEDIA_AMBIGUITY_MARGIN.
//
// The branch tests in test-media-decision.ts prove the logic against fixed
// fixtures. This runs the same decision against a REAL catalogue, which is
// where the thresholds actually have to hold: it is real data that
// contains three separate entries titled "Before and after", and no
// synthetic fixture would have predicted that.
//
// Re-run this when a tenant's entries change materially — and expect to
// update the expected titles with it. These assertions name real entries,
// so an owner retitling "We use premium Straumann zirconia crowns..." to
// "Crowns brand" shows up here as four failures that are not regressions.
//
//   npx tsx scripts/calibrate-media-matching.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { decideMedia, type MediaCandidate } from "../lib/chat-media";
import type { ChatTurn } from "../lib/conversation-state";

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const u = (c: string): ChatTurn => ({ role: "user", content: c });
const a = (c: string): ChatTurn => ({ role: "assistant", content: c });

const OFFER = a("I can show you a before-and-after from one of our patients.");

const cases: [string, ChatTurn[], RegExp | null][] = [
  // The collision, resolved by what the visitor came for.
  ["implant patient accepts b&a", [u("I've lost most of my upper teeth and I'm looking at full mouth dental implants"), a("That's very treatable."), OFFER, u("yes")], /dental implants/i],
  ["hollywood smile patient accepts b&a", [u("I want a hollywood smile, veneers on my front teeth"), a("Lovely."), OFFER, u("yes")], /hollywood/i],
  ["topicless visitor accepts b&a sends NOTHING", [a("Hello!"), OFFER, u("yes")], null],
  ["implant patient asks directly", [u("I need dental implants, how much?"), a("It depends."), u("can I see some before and afters?")], /dental implants/i],

  // Verbose real offers. Both were produced by the live model, and the
  // before-and-after one scores only 0.483 on the offer sentence alone.
  ["verbose b&a offer inside a crowns message", [u("I've lost most of my upper teeth, looking at full mouth dental implants"), a("We use premium Straumann zirconia crowns, known worldwide for their natural appearance alongside their strength and durability. The goal is always a result that blends seamlessly and looks like teeth you were born with. Would you like to see some before and after photos of implant cases we've done?"), u("yes")], /dental implants/i],
  ["anaphoric offer resolves via its own message", [u("what crowns do you use?"), a("We use premium Straumann zirconia crowns, known worldwide for their natural appearance. Would you like to see what they actually look like up close?"), u("yes")], /crowns? brand/i],

  // Unambiguous cases must still work.
  ["offer the implants we use", [u("what implants do you use?"), a("I can show you the implants we use if you'd like."), u("yes please")], /implants? brand/i],
  ["offer the crowns", [u("what crowns?"), a("I can show you the Straumann crowns we use."), u("yes")], /crowns? brand/i],
  ["direct request crowns", [u("show me the crowns you use")], /crowns? brand/i],

  // Must send nothing.
  ["vague: some examples", [u("hi"), a("Would you like to see some examples?"), u("yes")], null],
  ["vague: shall I show you", [u("hi"), a("Shall I show you something?"), u("ok")], null],
  ["request: clinic building", [u("can I see a photo of your clinic building?")], null],
  ["request: price list", [u("can I see your price list?")], null],

  // Filed under a category rather than named in the title. "Before and
  // after" names no subject; its category, Hair transplant, is what tells
  // it apart - and must never pull it in front of a dental visitor.
  ["hair visitor asks for before-and-afters", [u("I'm looking into a hair transplant, my hairline has been receding for years"), a("That's very common."), u("can I see some before and afters?")], /^Before and after$/],
  ["hair visitor accepts a hair offer", [u("I'm looking into a hair transplant"), a("Would you like to see a before and after from one of our hair transplant patients?"), u("yes please")], /^Before and after$/],
  ["implant visitor never gets the hair case", [u("I'm looking at full mouth dental implants, I've lost most of my upper teeth"), a("That's very treatable."), u("can I see some before and afters?")], /dental implants/i],
  ["no request", [a("We have 15 years of experience."), u("that's good to know")], null],
  ["yes with no offer", [a("What brings you in?"), u("yes")], null],
  ["declined offer", [u("I want implants"), OFFER, u("no thanks")], null],
];

(async () => {
  const { data: tn } = await s.from("tenants").select("id").eq("slug", "prof-clinic").single();
  const { data: k } = await s
    .from("knowledge_base")
    .select("title,category,content,knowledge_base_media(media_url,media_type)")
    .eq("tenant_id", tn!.id);
  const entries: MediaCandidate[] = (k ?? []).map((e: any) => ({
    title: e.title ?? "",
    // Mirrors the route, which matches on category for entries whose title
    // names no subject. Leaving it out would calibrate against a matcher
    // the route no longer uses.
    category: e.category,
    content: e.content,
    media: (e.knowledge_base_media ?? []).map((m: any) => ({ url: m.media_url, type: m.media_type })),
  }));

  let pass = 0;
  for (const [label, history, expect] of cases) {
    const d = decideMedia(history, entries, new Set());
    const ok = expect === null ? !d.send : d.send && expect.test(d.title);
    if (ok) pass++;
    console.log(
      `${ok ? "  ok  " : "FAIL  "}${label.padEnd(38)} -> ${d.send ? d.title.slice(0, 40) : "NOTHING (" + d.reason + ")"}`
    );
  }
  console.log(`\nREAL ${pass}/${cases.length}`);
  process.exit(pass === cases.length ? 0 : 1);
})();
