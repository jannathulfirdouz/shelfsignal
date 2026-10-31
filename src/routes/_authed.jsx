import { useEffect, useState } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

// The analytics area is open to signed-in users AND to the public demo visitor.
// Pages that change data add their own sign-in gate; everything else here is
// read-only and backed by entity rules that only expose analytics data.
export const Route = createFileRoute("/_authed")({
  ssr: false,
  component: ShellLayout,
});

function ShellLayout() {
  // The server renders nothing for this ssr:false layout, so the first client
  // render must also be empty; the shell mounts right after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}