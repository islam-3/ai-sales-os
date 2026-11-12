// A reply to a price question always gives the visitor something to do.
//
// Price is the moment a sales conversation is won or lost, and the reply
// to it was a dead end: "the team will confirm the price after assessing
// your case", and nothing for the visitor to do. gpt-6.1-terra did that
// in 12 of 12 conversations, Sonnet in 1 of 12
// (docs/reply-provider-2026-11-08.md). The business's strategy is to
// route the visitor to a concrete path: for an accurate quote the team
// needs to see the case or know what they need, plus a name and a
// WhatsApp number.
//
// ── Three layers, all decided in code ───────────────────────────────
//   1. The classifier, which already runs every turn, reads
//      asks_about_price (lib/visitor-signals.ts). No new call.
//   2. decidePriceStep below turns that and the transcript into a fact,
//      and the state block states it (priceStepLines). This is the same
//      mechanism as the hesitation branch.
//   3. After the reply is written, ensurePriceStep checks for the step
//      structurally and, if it is missing, appends a fixed sentence in
//      the visitor's language. Model-agnostic: it reads punctuation and
//      digits, not words.
//
// ── Multi-industry, deliberately ────────────────────────────────────
// Nothing here names a trade. Whether the step asks to SEE the case or
// to HEAR what they need comes from the business's own material: the
// "photos" coverage dimension (lib/coverage-relevance.ts) is relevant
// only when the material says the case has to be seen before it can be
// assessed or priced. A business that quotes from a price list never
// gets it. scripts/test-price-next-step.ts fails if any line or sentence
// here carries an industry word.
//
// ── Where the step happens ──────────────────────────────────────────
// Here in the chat: the visitor can attach a photo, and their name and
// number are read into the lead by extraction. The business's own
// WhatsApp number is never needed, so a tenant without one gets exactly
// the same step.

import { fallbackLanguage, type FallbackLanguage } from "./safe-fallback";

/** What the reply must ask for, or why it must ask for nothing. */
export type PriceStep =
  /** Not a price question, or hesitation already makes its own offer. */
  | { kind: "none" }
  /** No contact yet: see the case, plus name and WhatsApp. */
  | { kind: "case_and_contact" }
  /** No contact yet: a few details, plus name and WhatsApp. */
  | { kind: "details_and_contact" }
  /** Contact given, case not seen yet: the photo only. */
  | { kind: "case_only" }
  /** Contact given and nothing left to ask: say the quote will follow. */
  | { kind: "quote_follows" };

export type PriceStepInput = {
  /** The classifier's asks_about_price for this turn. */
  asksAboutPrice: boolean;
  /** The classifier's hesitation for this turn. */
  hesitating: boolean;
  /** Whether a name and number have already been given (hasContactDetails). */
  contactKnown: boolean;
  /** Whether a photo has already been attached in this conversation. */
  caseSeen: boolean;
  /** Whether this business needs to see the case: relevantFor.has("photos"). */
  seeingTheCaseApplies: boolean;
};

/**
 * The one decision, used by both the state block and the check after the
 * reply, so the two can never disagree about what was asked for.
 *
 * Hesitation wins. Its branch already makes exactly one gentle offer,
 * and a price step on top of it would be the second ask that branch
 * forbids.
 */
export function decidePriceStep(input: PriceStepInput): PriceStep {
  if (!input.asksAboutPrice || input.hesitating) return { kind: "none" };
  const needsCase = input.seeingTheCaseApplies && !input.caseSeen;
  if (!input.contactKnown) return { kind: needsCase ? "case_and_contact" : "details_and_contact" };
  return { kind: needsCase ? "case_only" : "quote_follows" };
}

/**
 * The state-block lines for a price question.
 *
 * Generic on purpose: "their case", "what they need", never a trade's
 * own nouns. The model writes the actual sentence in the visitor's
 * language; these lines only say what it must contain.
 */
export function priceStepLines(step: PriceStep, impatient: boolean): string[] {
  if (step.kind === "none") return [];
  const priceRule =
    "The visitor asked about price. Give any price the business's own material states, and never invent or estimate one it does not.";
  const form = impatient
    ? "They sound frustrated, so make the step one plain sentence, not a question."
    : "Make it one short question at the end of your reply.";
  switch (step.kind) {
    case "case_and_contact":
      return [
        "",
        priceRule,
        "Then end the reply with exactly one concrete next step: for an accurate quote the team needs to see their case, so invite them to attach a photo of it here in the chat and to leave their name and WhatsApp number.",
        form,
      ];
    case "details_and_contact":
      return [
        "",
        priceRule,
        "Then end the reply with exactly one concrete next step: for an accurate quote the team needs a few details, so invite them to say briefly what they need and to leave their name and WhatsApp number here in the chat.",
        form,
      ];
    case "case_only":
      return [
        "",
        priceRule,
        "They have already given their contact details. End the reply with one concrete next step: for an accurate quote the team needs to see their case, so invite them to attach a photo of it here in the chat.",
        form,
      ];
    case "quote_follows":
      return [
        "",
        priceRule,
        "They have already given everything the team needs to prepare a quote. Tell them the team will follow up with an accurate quote. Ask for nothing else.",
      ];
  }
}

/**
 * The fixed sentences, for when the reply has no step at all.
 *
 * Two variants per language: seeing the case, or hearing what they need.
 * Each ends with a question, so a reply with no question of its own gains
 * exactly one. Generic wording only; the Arabic is Modern Standard.
 */
export const PRICE_STEP_SENTENCES: Record<FallbackLanguage, { case: string; details: string }> = {
  en: {
    case: "For an accurate quote, our team needs to see your case. Could you attach a photo of it here and leave your name and WhatsApp number?",
    details: "For an accurate quote, our team needs a few details. Could you tell us briefly what you need and leave your name and WhatsApp number?",
  },
  ar: {
    case: "للحصول على عرض سعر دقيق، يحتاج فريقنا إلى الاطلاع على حالتك. هل يمكنك إرفاق صورة توضّحها هنا، مع ترك اسمك ورقم الواتساب الخاص بك؟",
    details: "للحصول على عرض سعر دقيق، يحتاج فريقنا إلى بعض التفاصيل. هل يمكنك أن تخبرنا باختصار بما تحتاج إليه، مع ترك اسمك ورقم الواتساب الخاص بك؟",
  },
  ru: {
    case: "Чтобы назвать точную цену, нашей команде нужно увидеть ваш случай. Можете прикрепить здесь фото и оставить своё имя и номер WhatsApp?",
    details: "Чтобы назвать точную цену, нашей команде нужно несколько деталей. Можете коротко рассказать, что вам нужно, и оставить своё имя и номер WhatsApp?",
  },
  tr: {
    case: "Size net bir fiyat verebilmemiz için ekibimizin durumunuzu görmesi gerekiyor. Buraya bir fotoğraf ekleyip adınızı ve WhatsApp numaranızı bırakabilir misiniz?",
    details: "Size net bir fiyat verebilmemiz için ekibimizin birkaç ayrıntıya ihtiyacı var. Neye ihtiyacınız olduğunu kısaca anlatıp adınızı ve WhatsApp numaranızı bırakabilir misiniz?",
  },
  es: {
    case: "Para darte un precio exacto, nuestro equipo necesita ver tu caso. ¿Puedes adjuntar aquí una foto y dejarnos tu nombre y tu número de WhatsApp?",
    details: "Para darte un precio exacto, nuestro equipo necesita algunos detalles. ¿Puedes contarnos brevemente qué necesitas y dejarnos tu nombre y tu número de WhatsApp?",
  },
  zh: {
    case: "为了给您准确的报价，我们的团队需要了解您的具体情况。您可以在这里上传一张相关照片，并留下您的姓名和WhatsApp号码吗？",
    details: "为了给您准确的报价，我们的团队需要了解一些细节。您可以简单说说您的需求，并留下您的姓名和WhatsApp号码吗？",
  },
  ja: {
    case: "正確なお見積もりのため、担当チームが状況を確認する必要があります。こちらに写真を添付し、お名前とWhatsApp番号を教えていただけますか？",
    details: "正確なお見積もりのため、いくつか詳細をお伺いする必要があります。ご希望の内容を簡単に教えていただき、お名前とWhatsApp番号もお知らせいただけますか？",
  },
};

/** A question, in any script. */
const QUESTION = /[?؟？]/;

export type EnsuredReply = {
  reply: string;
  /** Why nothing was appended, or that something was. For logs and the experiment. */
  outcome: "not_needed" | "model_gave_step" | "appended" | "skipped_impatient" | "skipped_no_language";
};

/**
 * The reply, with the step appended if the model left it out.
 *
 * Only for the two "no contact yet" steps: that is the dead end the
 * measurement found, and the sentences ask for exactly that. The check is
 * structural and works in any script: the reply already ends the turn on
 * a question, so the visitor has something to answer. A dead-end reply
 * has no question at all.
 *
 * Never appends when the visitor is impatient (the step there is a
 * statement, and a question would break that instruction), or when the
 * language cannot be resolved: a sentence in the wrong language is the
 * failure this project exists to avoid.
 */
export function ensurePriceStep(
  reply: string,
  step: PriceStep,
  context: { impatient: boolean; visitorMessages: string[]; chatLanguage?: string | null }
): EnsuredReply {
  if (step.kind !== "case_and_contact" && step.kind !== "details_and_contact") {
    return { reply, outcome: "not_needed" };
  }
  if (QUESTION.test(reply)) return { reply, outcome: "model_gave_step" };
  if (context.impatient) return { reply, outcome: "skipped_impatient" };
  const language = fallbackLanguage(context.visitorMessages, context.chatLanguage);
  if (!language) return { reply, outcome: "skipped_no_language" };
  const sentence = PRICE_STEP_SENTENCES[language][step.kind === "case_and_contact" ? "case" : "details"];
  return { reply: `${reply.trimEnd()}\n\n${sentence}`, outcome: "appended" };
}
