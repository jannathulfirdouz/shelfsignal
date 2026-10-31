import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { explainRecommendation } from "@/lib/recommendations-fns";

const TYPE_LABEL = { reorder: "Reorder", markdown: "Markdown", investigate: "Investigate", re_engage: "Re-engage" };
const CONF = { high: "bg-emerald-50 text-emerald-700", medium: "bg-amber-50 text-amber-700", low: "bg-muted text-muted-foreground" };
const STATUS = { new: "bg-sky-50 text-sky-700", accepted: "bg-emerald-50 text-emerald-700", rejected: "bg-rose-50 text-rose-700" };

const CONF_RULE = "Confidence: high when backtest WAPE is under 25%, medium between 25% and 45%, low above 45% or when the series has no forecast. A trust score under 90% drops it one level.";

// One definition per recommendation type, shown on the card so the number is never
// read as revenue that has already been earned.
const IMPACT_RULE = {
  reorder: "Expected impact = shortfall units (reorder point minus on-hand and on-order units, floored at zero) × unit price.",
  markdown: "Expected impact = on-hand units at risk of write-off × unit cost.",
  investigate: "Expected impact = absolute difference between actual and expected revenue on the flagged days, summed.",
  re_engage: "Expected impact = the customer's historic monetary value (quantity × unit price across all orders).",
};

export function RecommendationCard({ rec, canDecide, canExplain = true, onDecide, busy }) {
  const explain = useServerFn(explainRecommendation);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [explanation, setExplanation] = useState(rec.ai_explanation || "");
  const [explaining, setExplaining] = useState(false);
  const [err, setErr] = useState(null);
  const decided = rec.status !== "new";

  const explainWithAI = async () => {
    setExplaining(true); setErr(null);
    try { const r = await explain({ data: { id: rec.id } }); setExplanation(r.explanation || ""); }
    catch (e) { setErr(e?.data?.message || e?.message || "Could not generate an explanation."); }
    finally { setExplaining(false); }
  };
  const decide = (status) => onDecide(rec.id, status, note);

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">{TYPE_LABEL[rec.type] || rec.type}</span>
              <span title={CONF_RULE} className={`cursor-help rounded-full px-2 py-0.5 text-[11px] font-medium ${CONF[rec.confidence] || CONF.low}`}>{rec.confidence} confidence</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[rec.status] || STATUS.new}`}>{rec.status}</span>
            </div>
            <p className="mt-1.5 font-semibold">{rec.title}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">£{Number(rec.expected_impact_gbp || 0).toLocaleString("en-GB")}</p>
            <p title={IMPACT_RULE[rec.type] || ""} className="cursor-help text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2">expected impact · {rec.store_id}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{rec.reason}</p>
        <p className="text-[11px] text-muted-foreground">{IMPACT_RULE[rec.type] || "No impact definition for this type."}</p>

        {explanation && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Explain with AI</p>
            {explanation}
          </div>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="flex flex-wrap items-center gap-2">
          {canExplain && (
            <Button size="sm" variant="outline" onClick={explainWithAI} disabled={explaining}>
              {explaining ? "Explaining…" : explanation ? "Regenerate explanation" : "Explain with AI"}
            </Button>
          )}
          {canDecide && !decided && (
            <>
              <Button size="sm" onClick={() => (showNote ? decide("accepted") : setShowNote(true))} disabled={busy}>Accept</Button>
              <Button size="sm" variant="outline" onClick={() => (showNote ? decide("rejected") : setShowNote(true))} disabled={busy}>Reject</Button>
            </>
          )}
          {decided && (
            <span className="text-xs text-muted-foreground">
              {rec.status === "accepted" ? "Accepted" : "Rejected"}{rec.decided_by ? ` by ${rec.decided_by}` : ""}{rec.decision_note ? ` — "${rec.decision_note}"` : ""}
            </span>
          )}
        </div>

        {canDecide && !decided && showNote && (
          <div className="space-y-2">
            <Textarea rows={2} placeholder="Optional note for the audit log" value={note} onChange={(e) => setNote(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Choose Accept or Reject above to save your decision.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}