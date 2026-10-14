import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData } from "@/lib/server-fns";
import { useAuth } from "@/lib/AuthContext";
import { TrustBadge } from "@/components/TrustBadge";
import { ImportStatusBadge } from "@/components/ImportStatusBadge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, ShoppingBag, AlertTriangle, Package, Users, Database, Store } from "lucide-react";

export const Route = createFileRoute("/_authed/dashboard")({
  ssr: false,
  loader: () => getDashboardData(),
  head: () => ({ meta: [{ title: "Dashboard · ShelfSignal" }] }),
  component: Dashboard,
});

function Dashboard() {
  const data = Route.useLoaderData();
  const { user } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const storeId = user?.store_id || user?.data?.store_id || "";

  if (role === "store_manager" && !storeId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
        <Store className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">No store assigned. Ask an owner to assign your store.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Signed in as <span className="font-medium capitalize">{role.replace("_", " ")}</span>
          {role === "store_manager" && user?.store_id ? ` · ${user.store_id}` : ""}. All figures in GBP (£).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ShoppingBag} label="Transactions" value={data.counts.transactions} />
        <StatCard icon={AlertTriangle} label="Quarantined" value={data.counts.quarantined} tone="amber" />
        <StatCard icon={Package} label="Products" value={data.counts.products} />
        <StatCard icon={Users} label="Customers" value={data.counts.customers} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent import batches</CardTitle>
            <CardDescription>Each import is recorded with its trust score and row counts.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentBatches.length === 0 ? (
              <EmptyState text="No imports yet. Use the Import page to load your first CSV." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="pb-2 font-medium">File</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Rows</th>
                      <th className="pb-2 font-medium">Trust</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentBatches.map((b) => (
                      <tr key={b.id} className="border-t border-border">
                        <td className="py-2.5">{b.file_name}</td>
                        <td className="py-2.5">
                          <ImportStatusBadge status={b.status} />
                        </td>
                        <td className="py-2.5">
                          {b.rows_passed}/{b.rows_in}
                        </td>
                        <td className="py-2.5">
                          <TrustBadge score={b.trust_score} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-accent" />
              Trust Layer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Average trust score (imported rows only, failed imports excluded):{" "}
              <span className="font-semibold text-foreground">
                {data.avgTrust != null ? `${data.avgTrust}%` : "—"}
              </span>
            </p>
            <p>Quarantined transactions are excluded from headline figures until reviewed.</p>
            <p>Simulated fields (unit costs, lead times, emails) are tagged wherever shown.</p>
            <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3">
              <Database className="h-4 w-4 text-accent" />
              <span>Source: UCI Online Retail II · Dec 2010–Dec 2011</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  const iconTone = tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-accent/10 text-accent";
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value?.toLocaleString("en-GB") ?? 0}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }) {
  return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>;
}