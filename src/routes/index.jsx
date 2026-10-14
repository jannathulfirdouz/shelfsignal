import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Gauge, EyeOff, Database, LineChart, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ShelfSignal — Retail intelligence you can trust" },
      { name: "description", content: "Quality-checked retail analytics with a transparent Trust Layer. Built on the UCI Online Retail II dataset." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LineChart className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">ShelfSignal</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block">
            Dashboard
          </Link>
          <Link
            to="/login"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/[0.04] to-transparent" />
        <div className="mx-auto max-w-4xl px-4 py-20 text-center md:px-8 md:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs font-medium text-accent">
            <ShieldCheck className="h-3.5 w-3.5" />
            The Trust Layer
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight md:text-6xl">
            Retail intelligence <br className="hidden sm:block" />
            <span className="text-accent">you can trust.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Every number in ShelfSignal is backed by quality-checked data — and every figure shows you exactly how far
            to trust it. Simulated fields are labelled wherever they appear.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign in to the app
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-6 py-3 text-sm font-medium hover:bg-muted"
            >
              Explore the dashboard
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">All monetary figures shown in GBP (£).</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 md:px-8">
        <h2 className="text-center text-2xl font-semibold md:text-3xl">How the Trust Layer works</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Feature
            icon={Gauge}
            title="Trust scores on every batch"
            body="Each import is scored by the share of rows that pass validation, so you know the quality of what you're looking at."
          />
          <Feature
            icon={ShieldCheck}
            title="Quality-checked data"
            body="Quarantined transactions and failed rows are flagged, never silently mixed into your headline numbers."
          />
          <Feature
            icon={EyeOff}
            title="Simulated fields, clearly labelled"
            body="Where a field is simulated — supplier lead times, unit costs, customer emails — it carries a Simulated tag."
          />
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-16 md:px-8">
          <div className="rounded-2xl border border-border bg-card p-8 md:p-10">
            <div className="flex items-center gap-2 text-accent">
              <Database className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">Data source</span>
            </div>
            <h3 className="mt-4 text-xl font-semibold">UCI Online Retail II</h3>
            <p className="mt-3 text-muted-foreground">
              ShelfSignal is built on a real UK-based online gift and homeware retailer's transactional data, covering
              December 2010 to December 2011. The dataset was prepared in Python; some fields — supplier lead times,
              minimum order quantities, unit costs and customer emails — are <strong>simulated</strong> and are labelled
              as such wherever they appear.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Fact label="Period" value="Dec 2010 – Dec 2011" />
              <Fact label="Source" value="UK online gift & homeware retailer" />
              <Fact label="Currency" value="GBP (£)" />
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        ShelfSignal · Retail intelligence with a Trust Layer
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, body }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}