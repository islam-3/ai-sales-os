import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { DashboardShell, DashboardMessage } from "@/components/dashboard/DashboardShell";
import { PersonalDetailsForm } from "@/components/dashboard/profile/PersonalDetailsForm";
import { EmailForm } from "@/components/dashboard/profile/EmailForm";
import { PasswordForm } from "@/components/dashboard/profile/PasswordForm";

// Always fetch fresh so a saved name/phone (or a confirmed email change)
// is reflected the moment the user comes back to this page.
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const context = await getCurrentTenant();

  // middleware.ts already keeps signed-out visitors away from /dashboard;
  // this only fires if the session is somehow missing its tenant.
  if (!context) {
    return (
      <DashboardMessage>
        We couldn&apos;t find a clinic for your account. Please log in again.
      </DashboardMessage>
    );
  }

  const { businessName, user } = context;

  // Everything here comes from the Auth user, which getCurrentTenant()
  // resolved from the session cookie — so a signed-in owner can only ever
  // be looking at their own profile. There's no id in the URL to tamper
  // with, and every write below goes through updateUser(), which is
  // likewise scoped to the caller's own record.
  const metadata = (user.user_metadata ?? {}) as { full_name?: string; phone?: string };

  return (
    <DashboardShell
      clinicName={businessName}
      title="Profile"
      description="Your personal account details, separate from your business information."
      contentWidth="narrow"
    >
      {/* Evenly spaced stack — the cards' own borders separate the
          sections, so no extra rules are needed between them. */}
      <div className="flex flex-col gap-6">
        <PersonalDetailsForm
          initialFullName={metadata.full_name ?? ""}
          initialPhone={metadata.phone ?? ""}
        />
        <EmailForm currentEmail={user.email ?? ""} />
        <PasswordForm currentEmail={user.email ?? ""} />
      </div>
    </DashboardShell>
  );
}
