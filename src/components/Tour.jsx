import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { X, ArrowRight, ArrowLeft } from "lucide-react";

const KEY = "shelfsignal.tour.v1";

// Five-stop tour of the trust features. Each stop moves to the page it talks
// about, so the visitor sees the feature while reading the note.
const STEPS = [
  { route: "/home", title: "Trust badge", body: "Every analytics page carries a Trust badge showing the score of the batch behind the numbers, how many rows were excluded, and when it was last checked." },
  { route: "/home", title: "Numbers with definitions", body: "Hover a KPI for its formula, owner and note. Fields built from simulated data are tagged Simulated so nothing is presented as measured when it is not." },
  { route: "/forecasting", title: "Forecasts that show their error", body: "Pick a store and series to see the actuals, the 8-week backtest and the forecast band, plus the WAPE of every model that competed for the win." },
  { route: "/actions", title: "Actions with confidence and impact", body: "Reorder, markdown, investigate and re-engage recommendations, each with the rule that set its confidence and the exact definition of its expected impact." },
  { route: "/governance", title: "Trace any KPI to its source", body: "Lineage walks from the imported file, through quarantined rows, to the summary table, formula and the pages that display it." },
];

export function Tour() {
  const navigate = useNavigate();
  const [step, setStep] = useState(-1);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== "done") setStep(0);
    } catch { /* storage unavailable */ }
    const restart = () => setStep(0);
    window.addEventListener("shelfsignal:start-tour", restart);
    return () => window.removeEventListener("shelfsignal:start-tour", restart);
  }, []);

  useEffect(() => {
    if (step >= 0 && STEPS[step]) navigate({ to: STEPS[step].route });
  }, [step, navigate]);

  const finish = () => {
    try { localStorage.setItem(KEY, "done"); } catch { /* storage unavailable */ }
    setStep(-1);
  };

  if (step < 0 || !STEPS[step]) return null;
  const current = STEPS[step];

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Guided tour · step {step + 1} of {STEPS.length}</p>
        <button onClick={finish} aria-label="Close tour" className="rounded p-1 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 font-semibold">{current.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{current.body}</p>
      <div className="mt-3 flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={finish}>Skip</Button>
        <div className="flex gap-2">
          {step > 0 && <Button size="sm" variant="outline" onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4" />Back</Button>}
          <Button size="sm" onClick={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}>
            {step === STEPS.length - 1 ? "Done" : "Next"}<ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}