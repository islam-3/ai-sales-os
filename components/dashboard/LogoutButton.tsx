"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

// `className` lets the mobile drawer render this as a full-width row
// without duplicating the sign-out logic.
export function LogoutButton({ className }: { className?: string } = {}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("gap-1.5 text-muted-foreground hover:text-foreground", className)}
      onClick={handleLogout}
      disabled={isLoading}
    >
      <LogOut className="h-3.5 w-3.5" />
      {isLoading ? "Logging out…" : "Log out"}
    </Button>
  );
}
