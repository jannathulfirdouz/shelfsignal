import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Compass, ShieldCheck, BookOpen, Activity, AlertTriangle } from "lucide-react";

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

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-accent" />Models used</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Demand forecasting.</span> Five weekly models compete on an
              eight-week backtest: last value (naive), four-week moving average, simple exponential smoothing, Holt's
              linear trend and damped Holt, whose trend flattens with the horizon. The winner is the lowest WAPE, with
              bias reported beside it, and the forecast carries a band of ± 1.28 × backtest error σ × √(weeks ahead).
            </p>
            <p>
              <span className="font-medium text-foreground">Customer segments.</span> K-means over winsorised recency,
              frequency and monetary value, with clusters ranked by their centroids into Champions, Loyal, At risk and
              Lost, then cross-checked against plain RFM quintiles so the result can be audited.
            </p>
            <p>
              <span className="font-medium text-foreground">Product class.</span> ABC by cumulative revenue share and XYZ
              by the coefficient of variation of weekly units, per store.
            </p>
            <p>
              <span className="font-medium text-foreground">Anomalies.</span> A rolling 28-day expectation per store and
              category; a trading day is flagged only when it is both unusual (|z| above 3) and material (at least £500
              from expectation). November and December days are labelled Peak season rather than treated as a warning.
            </p>
            <p>
              <span className="font-medium text-foreground">Recommendations.</span> Rules over inventory, forecast and
              segment data, with the impact in pounds taken from the published metric definitions. Explanations quote
              the stored numbers only and never generate figures of their own.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />Known limitations</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              One year of history means yearly seasonality cannot be learned. Forecasts beyond December 2011 will not
              anticipate the January drop, and the Christmas peak is not built into any model.
            </p>
            <p>
              A series needs 16 complete weeks to be forecast. Shorter series are listed as skipped with the reason,
              rather than given a forecast built on thin history.
            </p>
            <p>
              The file ends on 9 December 2011, so the final week and that month are partial and are shown separately
              instead of being compared like-for-like.
            </p>
            <p>
              Product cost, and therefore gross margin, is simulated. Inventory positions, lead times and days since
              last sale are simulated too, and tagged wherever they appear.
            </p>
            <p>
              Segment, class, forecast and recommendation results reflect their last run; re-running a model is what
              refreshes them. Anomalies are detected per store and category, so a spike confined to a single product
              may not surface.
            </p>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          <Link to="/" className="underline-offset-4 hover:underline">Back to the landing page</Link>
        </p>
      </main>
    </div>
  );
}