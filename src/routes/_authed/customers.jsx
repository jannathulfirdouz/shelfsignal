import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getSegmentData } from "@/lib/ml-fns";
import { useAuth } from "@/lib/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const Route = createFileRoute("/_authed/customers")({
  ssr: false,
  loader: () => getSegmentData({ data: {} }),
  head: () => ({ meta: [{ title: "Customers · ShelfSignal" }] }),
  component: CustomersPage,
});

const SEG_COLORS = { Champions: "bg-emerald-50 text-emerald-700", Loyal: "bg-sky-50 text-sky-700", "At risk": "bg-amber-50 text-amber-700", Lost: "bg-rose-50 text-rose-700" };

function CustomersPage() {
  const data = Route.useLoaderData();
  const { user } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const showEmail = role === "owner";

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" subtitle="RFM segmentation. Customers without a reference are excluded." />

      {data.totalCustomers === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No segments yet — run segmentation from the Models page.</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.summary.map((s) => (
              <Card key={s.segment}><CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SEG_COLORS[s.segment] || "bg-muted text-muted-foreground"}`}>{s.segment}</span>
                  <span className="text-xs text-muted-foreground">{s.revenueShare}% of revenue</span>
                </div>
                <p className="mt-2 text-2xl font-semibold">{s.count.toLocaleString("en-GB")}</p>
                <p className="text-xs text-muted-foreground">avg {s.avgRecency}d since last · {s.avgFrequency}× orders · £{s.avgMonetary.toLocaleString("en-GB")}</p>
              </CardContent></Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>At-risk revenue</CardTitle>
              <CardDescription>Revenue tied to "At risk" customers — worth re-engaging.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">£{data.atRiskRevenue.toLocaleString("en-GB", { minimumFractionDigits: 0 })}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Customers by segment</CardTitle><CardDescription>Emails {showEmail ? "shown (owner)" : "masked — owners only"}.</CardDescription></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground"><tr>{["Customer", "Store", "Segment", "Recency (d)", "Frequency", "Monetary", "Email"].map((c) => <th key={c} className="pb-2 pr-4 font-medium">{c}</th>)}</tr></thead>
                  <tbody>
                    {data.customers.map((c) => (
                      <tr key={c.customer_ref} className="border-t border-border">
                        <td className="py-2 pr-4 font-medium">{c.customer_ref}</td>
                        <td className="py-2 pr-4">{c.store_id}</td>
                        <td className="py-2 pr-4"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SEG_COLORS[c.segment] || ""}`}>{c.segment}</span></td>
                        <td className="py-2 pr-4">{c.recency}</td>
                        <td className="py-2 pr-4">{c.frequency}</td>
                        <td className="py-2 pr-4">£{c.monetary.toLocaleString("en-GB", { minimumFractionDigits: 0 })}</td>
                        <td className="py-2 pr-4">{showEmail ? (c.email || "—") : "[masked]"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}