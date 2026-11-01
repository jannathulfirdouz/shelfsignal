import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LineChart, ShieldCheck, BadgeCheck, BrainCircuit, ArrowRight, Eye, Lock } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ShelfSignal · Retail intelligence you can audit" },
      { name: "description", content: "Inventory, sales and customer analytics with a Trust Layer on every number: where it came from, how it was checked, and whether any part of it is simulated." },
    ],
  }),
  component: LandingPage,
});

const INSIDE = [
  ["Home", "Headline KPIs with metric definitions, trust badge and top actions"],
  ["Sales", "Monthly net revenue, category mix, return rates and country demand"],
  ["Inventory", "Stock cover, stockout risk, dead stock and ABC-XYZ classes"],
  ["Customers", "RFM segments checked against a rule-based baseline"],
  ["Forecasting", "Weekly demand with backtest error and an 8-week forecast band"],
  ["Action centre", "Reorder, markdown, investigate and re-engage recommendations"],
  ["Data quality", "Rule-by-rule pass rates, quarantined rows and column profiles"],
  ["Governance", "Data dictionary, metric definitions and KPI lineage"],
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <LineChart className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold leading-tight">ShelfSignal</p>
              <p className="text-[11px] text-muted-foreground">Retail intelligence</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link to="/about" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">About</Link>
            <Button asChild variant="outline" size="sm"><Link to="/login">Sign in</Link></Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 pb-10 pt-14 md:px-8 md:pt-20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <ShieldCheck className="h-3.5 w-3.5" /> Trust Layer on every number
          </span>
          <h1 className="mt-4 max-w-3xl font-heading text-3xl font-semibold leading-tight md:text-5xl">
            Retail intelligence you can audit, not just admire.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
            Inventory, sales and customer analytics built on a Trust Layer: every figure carries where it came from,
            which quality rules it passed, and whether any part of it is simulated. Explore the whole app read-only,
            or sign in to run the models and change decisions.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button asChild size="lg"><Link to="/home">View live demo<ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/about">How the trust layer works</Link></Button>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Eye className="h-3.5 w-3.5" /> No sign-up needed for the demo. Nothing in the demo can change data.
          </p>
        </section>

        <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-12 md:grid-cols-3 md:px-8">
          {[
            [ShieldCheck, "Trust Layer", "A Trust badge on every page: batch score, excluded rows and when it was last checked. Simulated fields are tagged in place."],
            [BadgeCheck, "Data quality engine", "Completeness, validity, uniqueness, consistency, timeliness and accuracy rules run per batch. Failures quarantine rows before they reach a KPI."],
            [BrainCircuit, "Models that show their error", "Forecasts, RFM segments, ABC-XYZ classes and anomalies, each with the backtest or baseline it is measured against."],
          ].map(([Icon, title, body]) => (
            <Card key={title}>
              <CardContent className="p-5">
                <Icon className="h-5 w-5 text-accent" />
                <p className="mt-3 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-12 md:px-8">
            <h2 className="text-xl font-semibold md:text-2xl">What the demo includes</h2>
            <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {INSIDE.map(([name, what]) => (
                <div key={name} className="border-b border-border pb-2">
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-sm text-muted-foreground">{what}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-12 md:px-8">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 text-accent" />
              <div>
                <p className="font-semibold">What the public demo can and cannot see</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Demo visitors can read the analytics and reference data only. Customer email addresses, the audit log,
                  privacy settings and user administration are never exposed, and no write is possible from a demo session.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground md:px-8">
          <span>ShelfSignal · sample dataset ends 9 December 2011</span>
          <div className="flex gap-4">
            <Link to="/about" className="hover:text-foreground">About</Link>
            <Link to="/login" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}