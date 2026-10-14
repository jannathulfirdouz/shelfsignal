import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { importChunk, finalizeImport } from "@/lib/server-fns";
import { Progress } from "@/components/ui/progress";
import { parseCsv, coerce } from "@/lib/csv";
import { ENTITY_FIELDS, IMPORTABLE_ENTITIES, autoMap } from "@/lib/entityFields";
import { TrustBadge } from "@/components/TrustBadge";
import { SimulatedTag } from "@/components/SimulatedTag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

const STEPS = ["Choose entity", "Upload CSV", "Map & preview", "Result"];

export function ImportFlow() {
  const [step, setStep] = useState(0);
  const [entity, setEntity] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef(null);
  const sendChunk = useServerFn(importChunk);
  const finalize = useServerFn(finalizeImport);

  const fields = entity ? ENTITY_FIELDS[entity] : [];

  function chooseEntity(name) {
    setEntity(name);
    setStep(1);
    resetFile();
  }

  function resetFile() {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
    setError("");
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0) {
      setError("Could not read any rows from this CSV.");
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(autoMap(parsed.headers, fields));
    setStep(2);
  }

  const previewRows = rows.slice(0, 20);

  function mapRow(r) {
    const obj = {};
    for (const f of fields) {
      const col = mapping[f.name];
      const v = coerce(col ? r[col] : "", f.type);
      if (v !== undefined) obj[f.name] = v;
    }
    // Sales rows always land unquarantined; quality rules run in a later phase.
    if (entity === "SalesTransaction") obj.is_quarantined = false;
    return obj;
  }

  const CHUNK_SIZE = 500;

  async function doImport() {
    setBusy(true);
    setError("");
    setProgress({ done: 0, total: rows.length });
    let passed = 0;
    try {
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE).map(mapRow);
        const res = await sendChunk({ data: { entity, rows: chunk } });
        passed += res.passed;
        setProgress({ done: Math.min(i + CHUNK_SIZE, rows.length), total: rows.length });
      }
      const summary = await finalize({
        data: { entity, fileName, rowsIn: rows.length, rowsPassed: passed },
      });
      setResult(summary);
      setStep(3);
    } catch (err) {
      setError(`${err.message || "Import failed"} — ${passed} of ${rows.length} rows were saved before it stopped.`);
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setEntity("");
    resetFile();
    setStep(0);
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 0 && <EntityPicker onPick={chooseEntity} />}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload a CSV — {entity}</CardTitle>
            <CardDescription>
              The file is parsed in your browser for preview. Nothing is stored until you confirm the import.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center transition-colors hover:border-accent hover:bg-muted/50">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium">Click to choose a CSV file</p>
                <p className="text-sm text-muted-foreground">First row must be a header row</p>
              </div>
            </label>
            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
            <button onClick={() => setStep(0)} className="mt-4 text-sm text-muted-foreground hover:text-foreground">
              ← Back
            </button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-accent" />
                {fileName}
              </CardTitle>
              <CardDescription>
                {rows.length} rows detected · previewing first {previewRows.length}. Map each field to a CSV column.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((f) => (
                  <div key={f.name} className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-sm font-medium">{f.name}</span>
                      {f.required && <span className="text-xs text-destructive">*</span>}
                      {f.simulated && <SimulatedTag />}
                    </div>
                    <select
                      value={mapping[f.name] || ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.name]: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="">— skip —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preview (first 20 rows)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {headers.map((h) => (
                          <td key={h} className="whitespace-nowrap px-3 py-2">
                            {r[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <button onClick={() => setStep(1)} className="text-sm text-muted-foreground hover:text-foreground">
              ← Back
            </button>
            <Button onClick={doImport} disabled={busy} className="bg-primary">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              Import {rows.length.toLocaleString("en-GB")} rows
            </Button>
          </div>
          {busy && (
            <div className="space-y-2 rounded-lg border border-border bg-card p-4">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Importing…</span>
                <span className="text-muted-foreground">
                  {progress.done.toLocaleString("en-GB")} / {progress.total.toLocaleString("en-GB")} rows
                </span>
              </div>
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {step === 3 && result && <ImportResult result={result} entity={entity} onRestart={restart} />}
    </div>
  );
}

function Stepper({ step }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              i <= step ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-sm ${i <= step ? "font-medium text-foreground" : "text-muted-foreground"}`}>{label}</span>
          {i < STEPS.length - 1 && <div className="h-px w-6 bg-border sm:w-10" />}
        </div>
      ))}
    </div>
  );
}

function EntityPicker({ onPick }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {IMPORTABLE_ENTITIES.map((name) => (
        <button
          key={name}
          onClick={() => onPick(name)}
          className="group rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-accent hover:shadow-sm"
        >
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 text-primary group-hover:bg-accent group-hover:text-accent-foreground">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <p className="font-semibold">{name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{ENTITY_FIELDS[name].length} columns</p>
        </button>
      ))}
    </div>
  );
}

function ImportResult({ result, entity, onRestart }) {
  const ok = result.status === "completed";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
          Import {result.status}
        </CardTitle>
        <CardDescription>Recorded as a DataBatch and written to the audit log.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <TrustBadge score={result.trust_score} />
          <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium">{entity}</span>
          <span className="text-sm text-muted-foreground">Batch {result.batch_id.slice(0, 8)}…</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Rows in" value={result.rows_in} />
          <Stat label="Rows passed" value={result.rows_passed} />
          <Stat label="Trust score" value={`${result.trust_score}%`} />
        </div>
        <p className="text-sm text-muted-foreground">
          The trust score reflects the share of rows that passed validation. Simulated fields are flagged wherever they
          appear across the app.
        </p>
        <Button onClick={onRestart} variant="outline">
          Import another file
        </Button>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold">{value}</p>
    </div>
  );
}