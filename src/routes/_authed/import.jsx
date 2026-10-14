import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/AuthContext";
import { ImportFlow } from "@/components/ImportFlow";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/_authed/import")({
  ssr: false,
  head: () => ({ meta: [{ title: "Import data · ShelfSignal" }] }),
  component: ImportPage,
});

function ImportPage() {
  const { user } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const canImport = role === "owner" || role === "analyst";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">Import data</h1>
        <p className="mt-1 text-muted-foreground">
          Upload a CSV, preview the first 20 rows, map columns to fields, then import. Every import is recorded as a
          DataBatch and written to the audit log.
        </p>
      </div>

      {canImport ? (
        <ImportFlow />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Read-only access</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Only owners and analysts can import data. Use the role switcher to try the analyst or owner role.
          </p>
        </div>
      )}
    </div>
  );
}