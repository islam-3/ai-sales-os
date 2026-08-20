import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

// ─────────────────────────────────────────────────────────────────────
// ⚠️  DRAFT — NOT LEGAL ADVICE
//
// The text below is a reasonable starting point written by a developer,
// not a lawyer. It has NOT been reviewed by a legal professional and must
// not be relied on as a compliant privacy policy.
//
// Before this is used with real visitors it needs review by someone
// qualified, who should check at minimum:
//   • which jurisdictions apply (GDPR, UK GDPR, CCPA, local law) and who
//     is controller vs processor between this platform and each business;
//   • the lawful basis for processing, and whether photos amount to
//     special-category / health data needing explicit consent;
//   • actual retention periods, which are deliberately left vague here
//     because no retention policy has been implemented in the product;
//   • the real identity and contact details of the data controller, which
//     are placeholders below.
//
// Anything in [SQUARE BRACKETS] is a placeholder that must be filled in.
// ─────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How information shared in the chat is collected, used, and stored.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      subtitle="How information you share in the chat is collected, used, and stored."
      otherDoc={{ href: "/terms", label: "Terms of Service" }}
    >
      <LegalSection title="Who this applies to">
        <p>
          When you use the chat, you are talking to an assistant operated on behalf of a specific
          business — the one whose page you opened. This policy describes what happens to the
          information you share in that conversation.
        </p>
        <p>
          The chat service is provided by [YOUR COMPANY NAME], which runs the platform on that
          business&apos;s behalf. You can contact us at [CONTACT EMAIL].
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <p>We collect what you choose to share in the conversation. In practice that means:</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>The messages you send, and the assistant&apos;s replies.</li>
          <li>
            Contact and personal details you provide — typically your name, phone number or
            WhatsApp number, and sometimes your age, location, or the country you would travel
            from.
          </li>
          <li>
            Any photos you upload, along with what you tell us about them. Depending on the
            business you are contacting, a photo may reveal health-related information about you.
          </li>
          <li>
            A randomly generated session identifier used to keep your conversation together. It is
            not linked to any account and is not used to track you across other websites.
          </li>
        </ul>
        <p>
          You do not have to provide any of this. You can use the chat without sharing contact
          details or photos, though the business may then be unable to follow up or assess your
          enquiry.
        </p>
      </LegalSection>

      <LegalSection title="Why we collect it">
        <p>
          To answer your questions during the conversation, and to pass your enquiry to the
          business as a lead so they can follow up with you. The business uses this to understand
          what you need before contacting you.
        </p>
        <p>
          A summary of your conversation and an automated qualification score are generated to help
          the business prioritise responses. These are produced automatically and are not a
          decision with legal or similarly significant effects about you.
        </p>
      </LegalSection>

      <LegalSection title="Who it is shared with">
        <p>
          Your conversation, contact details, and any photos are shared with{" "}
          <span className="text-foreground">the specific business you are chatting with</span> —
          not with other businesses using this platform, and not with advertisers. Each business
          can only see enquiries made through its own chat link.
        </p>
        <p>
          We also use service providers to run the platform: cloud hosting and database storage,
          and AI providers who process the text of your conversation to generate replies and
          summaries. They act on our instructions and do not use your information for their own
          purposes. Current providers are [LIST YOUR PROVIDERS, e.g. Supabase, Anthropic, OpenAI].
        </p>
      </LegalSection>

      <LegalSection title="How uploaded photos are stored">
        <p>
          Photos you upload are stored in private cloud storage. They are not publicly accessible,
          and they cannot be reached by guessing a web address.
        </p>
        <p>
          When someone at the business views a photo, the system generates a temporary link that
          expires after a short period. Access is restricted to the business you contacted.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          Conversations, lead details, and photos are retained while the business needs them to
          handle and follow up on your enquiry, and are deleted when they are no longer needed for
          that purpose.
        </p>
        <p className="text-foreground/70">
          [SPECIFY A CONCRETE RETENTION PERIOD — for example &quot;conversations and photos are
          deleted after 24 months of inactivity&quot;. No automatic deletion is currently
          implemented, so this needs both a decided policy and a mechanism to enforce it.]
        </p>
      </LegalSection>

      <LegalSection title="Your choices and how to request deletion">
        <p>
          You can ask for a copy of what we hold about you, ask us to correct it, or ask us to
          delete it. Depending on where you live you may also have the right to object to or
          restrict certain processing, and to complain to a data protection regulator.
        </p>
        <p>
          To make a request, email [CONTACT EMAIL] and describe the conversation — for example the
          business you contacted and roughly when. Because the chat does not require an account, we
          may need to ask a question or two to locate the right conversation before acting.
        </p>
        <p>
          You can also contact the business you spoke with directly, since they hold a copy of your
          enquiry.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          The chat is not intended for children. If you believe a child has shared information with
          us, contact [CONTACT EMAIL] and we will delete it.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If this policy changes, the updated version will be posted on this page. Last updated:
          [DATE].
        </p>
      </LegalSection>
    </LegalPage>
  );
}
