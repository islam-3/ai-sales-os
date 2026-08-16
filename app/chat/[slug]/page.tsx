import { resolveTenantBySlug } from "@/lib/resolve-tenant";
import { ChatClient } from "@/components/chat/ChatClient";

// Always resolve the slug fresh — a tenant can be created (or renamed)
// after this route is first built, and a stale "not found" would be a
// much worse failure mode than a stale success.
export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: { slug: string } }) {
  const tenant = await resolveTenantBySlug(params.slug);

  if (!tenant) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-white px-4 text-center dark:bg-black">
        <p className="text-sm text-black/60 dark:text-white/60">
          This chat link isn&apos;t valid. Please double-check the URL.
        </p>
      </div>
    );
  }

  return <ChatClient slug={params.slug} businessName={tenant.businessName} />;
}
