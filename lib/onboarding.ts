import type { TenantSettings } from "./tenant-settings";

export type OnboardingStep = {
  id: "business" | "knowledge" | "chat-link";
  title: string;
  description: string;
  href: string;
  /** Label for the link when the step isn't done yet. */
  action: string;
  done: boolean;
};

export type OnboardingState = {
  steps: OnboardingStep[];
  completedCount: number;
  allComplete: boolean;
  /** Whether the checklist should render at all. */
  visible: boolean;
};

// Pure derivation — no I/O, so the rules are easy to read and test.
//
// Two of the three steps are computed from real data rather than stored
// flags, which means they can't drift out of sync with what's actually
// true. Only the chat-link step needs persistence, because "the owner
// copied their link" leaves no trace anywhere else.
export function getOnboardingState(input: {
  industry: string | null;
  description: string | null;
  knowledgeEntryCount: number;
  settings: TenantSettings;
}): OnboardingState {
  const { industry, description, knowledgeEntryCount, settings } = input;

  const steps: OnboardingStep[] = [
    {
      id: "business",
      title: "Complete your business information",
      description:
        "Your industry and a short description — this is what your assistant uses to introduce you.",
      href: "/dashboard/business",
      action: "Add business details",
      done: Boolean(industry?.trim()) && Boolean(description?.trim()),
    },
    {
      id: "knowledge",
      title: "Add your first knowledge base entry",
      description: "A fact about your business for the assistant to draw on in conversations.",
      href: "/dashboard/settings",
      action: "Add an entry",
      done: knowledgeEntryCount > 0,
    },
    {
      id: "chat-link",
      title: "Copy your chat link and try it out",
      description: "Share it in your ads or on your site — and send it a message yourself first.",
      // Anchors to the chat link card at the top of this same page.
      href: "#chat-link",
      action: "Go to your chat link",
      done: settings.onboarding?.chat_link_copied === true,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allComplete = completedCount === steps.length;

  return {
    steps,
    completedCount,
    allComplete,
    // Hidden once everything's done, and stays hidden for anyone who
    // dismissed it early. A dismissal is sticky on purpose: an
    // established owner shouldn't get the card back just because they
    // briefly emptied their knowledge base.
    visible: !allComplete && settings.onboarding?.dismissed !== true,
  };
}
