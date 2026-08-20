import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

// ─────────────────────────────────────────────────────────────────────
// ⚠️  DRAFT — NOT LEGAL ADVICE
//
// The text below is a reasonable starting point written by a developer,
// not a lawyer. It has NOT been reviewed by a legal professional and must
// not be relied on as enforceable terms of service.
//
// Before this is used with real users it needs review by someone
// qualified, who should check at minimum:
//   • the governing law and venue, which are a placeholder here, and
//     whether they are enforceable against consumers in the places your
//     visitors and businesses actually are;
//   • whether the liability limits and disclaimers below are permitted —
//     many jurisdictions void attempts to exclude liability for death,
//     personal injury, fraud, or statutory consumer rights, and a clause
//     that overreaches can be struck out entirely;
//   • the medical/professional-advice disclaimer, which matters more than
//     usual here because the assistant is deployed by clinics and steers
//     visitors toward sharing photos of their symptoms;
//   • whether separate terms are needed for the two audiences (visitors
//     using the chat vs businesses operating an account) rather than the
//     single combined document below;
//   • consumer-rights, cancellation, and refund obligations once billing
//     exists — none is implemented yet, so nothing here describes it.
//
// Anything in [SQUARE BRACKETS] is a placeholder that must be filled in.
// ─────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you use the chat service or operate a business account.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      subtitle="The terms that apply when you use this service."
      otherDoc={{ href: "/privacy", label: "Privacy Policy" }}
    >
      <LegalSection title="Who these terms apply to">
        <p>
          These terms cover two groups of people, and some sections apply to only one of them:
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <span className="text-foreground">Visitors</span> — anyone using a chat page to contact
            a business.
          </li>
          <li>
            <span className="text-foreground">Businesses</span> — anyone with an account who uses
            the dashboard to run an assistant for their own business.
          </li>
        </ul>
        <p>
          The service is operated by [YOUR COMPANY NAME] (&quot;we&quot;, &quot;us&quot;). You can
          reach us at [CONTACT EMAIL]. By using the service you agree to these terms; if you
          don&apos;t agree, please don&apos;t use it.
        </p>
      </LegalSection>

      <LegalSection title="The assistant gives general information, not professional advice">
        <p>
          The chat assistant is an automated system. It answers using information the business has
          provided about itself, and it can be incomplete, out of date, or wrong.
        </p>
        <p>
          <span className="text-foreground">
            Nothing the assistant says is medical, dental, legal, financial, or other professional
            advice
          </span>
          , and no conversation creates a professional relationship of any kind. It cannot diagnose
          a condition, assess your case, or tell you what treatment or course of action is right
          for you — only a qualified professional at the business can do that, after reviewing your
          situation properly.
        </p>
        <p>
          Never delay seeking professional help because of something the assistant said. If you
          have an urgent medical problem, contact your local emergency service.
        </p>
      </LegalSection>

      <LegalSection title="Each business is responsible for its own offering">
        <p>
          We provide the software. We do not provide the treatments, products, or services that
          businesses advertise through it, and we do not verify, endorse, or take responsibility
          for what any business claims, charges, promises, or delivers.
        </p>
        <p>
          Any agreement you reach about work, treatment, pricing, or appointments is between you
          and that business directly. Businesses are responsible for the accuracy of the
          information they load into their assistant, for holding the licences and qualifications
          their work requires, and for complying with the advertising and professional rules that
          apply to them.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>When using the service, you agree not to:</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>Use it for anything unlawful, or to harass, threaten, defraud, or impersonate.</li>
          <li>
            Upload content you have no right to share, or that contains someone else&apos;s
            personal or medical information without their permission.
          </li>
          <li>Upload malware, or anything designed to damage or interfere with the service.</li>
          <li>
            Attempt to break, probe, or circumvent the service&apos;s security, access data
            belonging to another business or visitor, or exceed the access your account is given.
          </li>
          <li>
            Scrape, bulk-extract, or automate access to the service, or use it to build a competing
            product.
          </li>
          <li>
            Attempt to manipulate the assistant into behaving outside its purpose or revealing
            another business&apos;s information.
          </li>
        </ul>
        <p>
          We may suspend or remove access that breaches these terms, or that puts the service or
          its users at risk.
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          If you operate a business account, you are responsible for keeping your login details
          secure and for activity that happens under your account. Tell us promptly at [CONTACT
          EMAIL] if you think someone else has access.
        </p>
        <p>
          You must have the authority to act for the business you register, and the information you
          give about it must be accurate.
        </p>
      </LegalSection>

      <LegalSection title="Content and ownership">
        <p>
          <span className="text-foreground">Your content stays yours.</span> Businesses keep
          ownership of the information they add about themselves, and visitors keep ownership of
          the messages and photos they share.
        </p>
        <p>
          You give us the permission we need to actually run the service with that content — to
          store it, process it, and show it to the intended recipient. For a business, that means
          using its information to power its assistant. For a visitor, that means passing the
          conversation and any photos to the business being contacted. We do not use your content
          to advertise to you or sell it on. How this works in practice, including how photos are
          stored, is described in the Privacy Policy.
        </p>
        <p>
          <span className="text-foreground">The platform stays ours.</span> The software,
          interface, and branding of the service itself remain our property, and these terms
          don&apos;t transfer any of it to you.
        </p>
      </LegalSection>

      <LegalSection title="No guarantee of results">
        <p>
          The service is provided as-is. We don&apos;t guarantee it will be uninterrupted or
          error-free, that the assistant will answer correctly every time, or that using it will
          produce any particular number of enquiries, leads, customers, or revenue.
        </p>
        <p>
          We may change, suspend, or discontinue parts of the service. Where a change would
          materially affect a business account, we will make a reasonable effort to give notice
          first.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the extent the law allows, we are not liable for indirect or consequential losses, or
          for lost profits, lost business, lost data, or losses arising from your dealings with a
          business you contacted through the service.
        </p>
        <p>
          Where liability cannot be excluded, our total liability to you is limited to [SPECIFY A
          CAP — for example the amount paid to us in the 12 months before the claim, or a fixed sum
          for visitors who pay nothing].
        </p>
        <p className="text-foreground/70">
          [Nothing in these terms is intended to exclude liability that cannot lawfully be
          excluded — commonly death or personal injury caused by negligence, fraud, and certain
          consumer rights. A lawyer should confirm the correct carve-out wording for
          [JURISDICTION].]
        </p>
      </LegalSection>

      <LegalSection title="Ending your use">
        <p>
          Businesses can stop using the service at any time and ask us to close their account and
          delete their data, as described in the Privacy Policy. We may suspend or end access where
          these terms are breached, or where we&apos;re required to by law.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We may update these terms as the service develops. The current version is always on this
          page, and continuing to use the service after a change means you accept the updated
          terms. Last updated: [DATE].
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws of [JURISDICTION], and the courts of [JURISDICTION]
          will have jurisdiction over any dispute.
        </p>
        <p className="text-foreground/70">
          [Consumers often keep the right to bring a claim in their own country regardless of this
          clause. A lawyer should confirm what is enforceable for the places your visitors and
          businesses are actually in.]
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>Questions about these terms: [CONTACT EMAIL].</p>
      </LegalSection>
    </LegalPage>
  );
}
