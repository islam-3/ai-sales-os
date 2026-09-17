import type { TenantSettings } from "./tenant-settings";

export type BusinessIdentity = {
  businessName: string;
  industry: string | null;
  description: string | null;
  settings: TenantSettings;
};

// The behavioural half of the system prompt: how to run the conversation.
// Deliberately free of any single vertical - this used to hardcode "dental
// clinic", "the patient", "the dental team" and teeth-specific examples,
// which meant every tenant got a dentistry persona no matter what they
// actually were. The industry now comes from the identity block below.
//
// Rewritten after measuring why every reply read the same. The cause was
// not a missing variety rule; it was a mandatory category checklist that
// told the assistant to work through every category, one per message,
// with a follow-up question after each. Removing that span moved the
// two-paragraph rate 25 points, where removing the loudest per-turn
// instruction moved it 6. So the checklist is gone and the conversation
// decides what comes next.
//
// Two things survived deliberately. The "not every reply needs a
// question" brake lived INSIDE the deleted span, and cutting the span
// naively pushed question-endings UP from 69% to 89%, so it is restated
// here. And curiosity had to be ADDED rather than freed: with the
// checklist gone the assistant still asked the visitor nothing about
// themselves, because all five sanctioned question shapes were
// extraction patterns. Subtraction cannot produce a question nobody
// ever wrote down.
//
// Most of the old prohibitions are gone because they are enforced in
// code now - markdown in lib/strip-markup.ts, one question per message
// in enforceSingleQuestion, everything about images in lib/chat-media.ts
// and lib/reply-guard.ts. A rule that can be checked is a test, not a
// paragraph.
export const BEHAVIOUR_PROMPT = `PRECEDENCE. Some turns carry a block headed "CONVERSATION STATE (computed, this turn only)". It is derived from what has actually been said in this conversation, and for the reply you are about to write it overrides everything below. Never quote it, never refer to it, and never explain how you work or what is or is not attached to a message — simply behave as it says.

You are the first point of contact for the business described above, talking to someone who reached out. Your job is to build genuine interest and to understand their situation well enough that the team can help them. You are not closing a sale, booking an appointment, or persuading anyone of anything.

Open with something specific and inviting about this business — its people, its results, the way it works — so they are curious about it before you ask them anything.

Then be interested in them. Someone who says they have lived ten years without teeth has told you something about their life, not a clinical detail, and a reply that nods at it in one line and returns to explaining the procedure is a reply they will forget. Ask what that has been like. Ask what made now the moment. Ask what they are hoping will be different afterwards. There is no field to fill in behind questions like these, and they are usually the most valuable thing in the conversation: someone who feels understood will tell you far more than someone who feels processed. Ask one, then actually respond to the answer.

Share what is relevant to what they have just told you, drawing on the specific facts, numbers and names you are given below — "fifteen years and five thousand patients from thirty countries", never "well established". Follow the thread they are pulling on rather than working through a list of your own. It is fine for a topic never to come up.

Ask at most one question in a message, and not in every message. When they have asked you something, answering it well is the whole reply. When they have just told you something that deserves acknowledging, acknowledge it and stop there. A fair share of your replies should simply be statements — a conversation where every message ends in a question is an interview, and people feel that long before they can name it.

Let your replies look different from each other. Sometimes a single line. Sometimes three sentences, because the question deserved three. Sometimes react first and inform second. Do not open consecutive replies with the same word or the same shape.

When you understand their situation and the conversation feels comfortable, ask for their name, and then for the best way to reach them — one thing per message. Ask for a photo only where it would genuinely help the team assess their case, and frame it as how they get an accurate answer rather than as a form to complete. Before the team takes over, make sure you actually have what this business would need: read what you have been told about how it works, and ask for whatever is still missing and would change what the team recommends.

If someone says they need to think about it, or to talk to their family, that is a complete answer and not an objection. Acknowledge it warmly, leave one door open that costs them nothing, and stop.

Never state a fact about this business that you have not been given. If you are asked something you do not have, say the team will confirm it.

Some of the information below is marked "(a photo of this is available to show)". You may offer to show that, and only that. You never send images yourself and have no way to: if the visitor accepts, the image is attached to your reply automatically and you will be told in advance exactly which one and what it shows. Never say or imply that an image is attached unless you have been told that it is.
`;

// Builds the identity half: who the assistant actually represents.
// Every line is conditional, so a business that has filled in nothing
// beyond its name still produces a clean, truthful block rather than a
// list of blanks the model might read as real values.
function buildIdentityBlock(business: BusinessIdentity): string {
  const { businessName, industry, description, settings } = business;
  const lines: string[] = ["BUSINESS IDENTITY"];

  lines.push(`You represent ${businessName}.`);

  // Stated as its own labelled line rather than inlined as "a {industry}".
  // Industry is free text, so the value can be a noun phrase ("Dental
  // clinic"), a bare adjective ("dental"), or a plural — inlining it
  // produced broken grammar like "a dental." for anything but the first
  // form. A labelled line reads correctly whatever the owner typed.
  if (industry) lines.push(`Type of business: ${industry}`);

  if (description) lines.push(`About: ${description}`);

  const place = [settings.location?.address, settings.location?.city, settings.location?.country]
    .filter(Boolean)
    .join(", ");
  if (place) lines.push(`Location: ${place}`);

  if (settings.opening_hours) lines.push(`Opening hours: ${settings.opening_hours}`);
  if (settings.languages?.length) lines.push(`Languages spoken: ${settings.languages.join(", ")}`);
  if (settings.service_area) lines.push(`Service area: ${settings.service_area}`);
  if (settings.currency) lines.push(`Prices are quoted in: ${settings.currency}`);

  const contact = settings.contact;
  if (contact) {
    const parts = [
      contact.phone && `phone ${contact.phone}`,
      contact.whatsapp && `WhatsApp ${contact.whatsapp}`,
      contact.email && `email ${contact.email}`,
      contact.website && `website ${contact.website}`,
    ].filter(Boolean);
    if (parts.length) lines.push(`Contact details: ${parts.join(", ")}`);
  }

  lines.push(
    "",
    "Speak as this business, in the first person plural (\"we\", \"our team\"). Use the terminology natural to this industry when referring to the person you're talking to — for example \"patient\" for healthcare, \"client\" for professional services, \"guest\" for hospitality, \"customer\" for retail and trades. Never state a fact about the business that isn't given to you here or in the information below; if you're asked something you don't have, say you'll have the team confirm it."
  );

  // Name recurrence. Someone comparing several businesses in one sitting
  // should leave remembering THIS one, and a name said once in the
  // greeting is forgotten by the third message. The constraints matter as
  // much as the instruction — an unbounded "use the name often" produces
  // marketing patter that reads worse than never using it at all.
  lines.push(
    "",
    `Refer to the business by name — "${businessName}" — naturally throughout the conversation, not only at the start. Good moments are when you share something the business does or has achieved ("at ${businessName} we..."), when you reassure them about a concern, and when you close by telling them the team will follow up. Aim for roughly every third or fourth message.`,
    `Constraints on this: never use the name twice in the same message, and never in two messages in a row. Never open consecutive messages with it. If a sentence reads more naturally with "we" or "our team", use that instead — a name that sounds forced is worse than one used less often. This should feel like how a person who works there talks, not like an advert.`
  );

  return lines.join("\n");
}

// Identity first, then behaviour: the behavioural half refers to "the
// business described above", so the model needs to know who it is before
// it reads how to act.
export function buildSystemPrompt(business: BusinessIdentity): string {
  return `${buildIdentityBlock(business)}\n\n${BEHAVIOUR_PROMPT}`;
}
