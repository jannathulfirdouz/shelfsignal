import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Compass, ShieldCheck, BookOpen } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About · ShelfSignal" },
      { name: "description", content: "What ShelfSignal is, where its data comes from, how the Trust Layer scores it, and what the public demo shows." },
    ],
  }),
  component: AboutPage,
});

function startTour() {
  // Clears the stored flag in the tour component and restarts it from step one.
  try { window.localStorage.removeItem("shelfsignal.tour.v1"); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event("shelfsignal:start-tour"));
}

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 md:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <LineChart className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold leading-tight">ShelfSignal</p>
              <p className="text-[11px] text-muted-foreground">Retail intelligence</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/home">Live demo</Link></Button>
            <Button asChild size="sm"><Link to="/login">Sign in</Link></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 md:px-8">
        <div>
          <h1 className="text-3xl font-semibold">About ShelfSignal</h1>
          <p className="mt-2 text-muted-foreground">
            A retail analytics workspace built around one idea: a number is only useful if you can see how much to trust it.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-accent" />Where the data comes from</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              The demo runs on an anonymised UK online-retail transaction file: order lines from 1 December 2010 to
              9 December 2011, with invoice, stock code, quantity, price, customer reference and country.
            </p>
            <p>
              Weekly and hourly summary tables are built by this app from those transactions, so every KPI on Home and
              Sales can be traced back to an imported batch. Product cost, and therefore gross margin, is simulated and
              tagged as such wherever it appears.
            </p>
            <p>
              Because the file ends on 9 December 2011, the last week and December itself are partial. Revenue for that
              month is shown with a lighter bar rather than compared like-for-like.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" />How the Trust Layer scores a batch</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Every import creates a batch and runs the active data quality rules across six dimensions: completeness,
              validity, uniqueness, consistency, timeliness and accuracy.
            </p>
            <p>
              The Trust Score is the weighted pass rate of those rules. Rows that fail a critical rule are quarantined
              and excluded from every KPI, forecast and recommendation. Accuracy is reported as a warning and is
              deliberately not scored, because it needs an external reference.
            </p>
            <p>
              Only a completed check produces a score. A batch whose import failed, or has not been checked, shows no
              trust figure at all rather than a flattering default.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Compass className="h-4 w-4 text-accent" />What the demo shows</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              The public demo is read-only and open to anyone: the analytics, forecasts, segments, recommendations,
              data dictionary, metric definitions and KPI lineage.
            </p>
            <p>
              Customer email addresses, the audit log, privacy retention settings and user administration are visible
              only to a signed-in owner. Running models, importing files and accepting recommendations need an owner or
              analyst account.
            </p>
            <Button variant="outline" size="sm" onClick={startTour}>Restart guided tour</Button>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          <Link to="/" className="underline-offset-4 hover:underline">Back to the landing page</Link>
        </p>
      </main>
    </div>
  );
}