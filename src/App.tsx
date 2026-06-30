import { Fragment, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { classifyLearner } from "./engine";
import type { Archetype, ClassificationResult, LearnerRow, Tier } from "./engine";
import { parseLearnerRows } from "./csv";
import { parseAndValidateCsv, downloadSampleCsv, EXPECTED_COLUMNS } from "./byoCsv";
import type { CsvValidationResult } from "./byoCsv";
import { fetchBriefing, fetchLearnerNarrative } from "./api";
import type { LearnerNarrative } from "./api";

interface ClassifiedLearner {
  row: LearnerRow;
  result: ClassificationResult;
}

type Mode = "demo" | "own";

type NarrativeState =
  | { status: "loading" }
  | { status: "done"; data: LearnerNarrative }
  | { status: "error"; message: string };

type BriefingState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string }
  | { status: "error"; message: string };

// Fixed dashboard sort order: Red -> Amber -> Watch -> Healthy.
const TIER_ORDER: Tier[] = ["red", "amber", "watch", "healthy"];

// Only Amber/Red learners ever get an LLM narrative call — llm-layer-spec.md
// Section A: "runs for each Amber/Red learner". Watch/Healthy never call out.
// Even for those, generation is opt-in per learner (see the "Generate AI
// take" button) — nothing fires automatically.
const NARRATIVE_TIERS: Tier[] = ["red", "amber"];

// Tier badge styling. Tier = "how fast" — red/amber/yellow/green, matching
// the 🔴/🟠/🟡/🟢 briefing-strip legend.
const TIER_META: Record<
  Tier,
  { label: string; emoji: string; chip: string; strip: string }
> = {
  red: {
    label: "Act today",
    emoji: "🔴",
    chip: "bg-red-100 text-red-700 ring-1 ring-inset ring-red-300",
    strip: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  },
  amber: {
    label: "This week",
    emoji: "🟠",
    chip: "bg-orange-100 text-orange-700 ring-1 ring-inset ring-orange-300",
    strip: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200",
  },
  watch: {
    label: "Watch",
    emoji: "🟡",
    chip: "bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-300",
    strip: "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-200",
  },
  healthy: {
    label: "Healthy",
    emoji: "🟢",
    chip: "bg-green-100 text-green-700 ring-1 ring-inset ring-green-300",
    strip: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200",
  },
};

// Archetype badge styling. Archetype = "what to do" — deliberately a
// different palette (gray/coral/violet/purple) so tier and archetype
// badges never visually collide. "healthy" (no archetype fired) gets a
// quiet neutral outline, distinct from Ghost's solid gray fill.
const ARCHETYPE_META: Record<
  Archetype,
  { label: string; emoji: string; chip: string }
> = {
  ghost: { label: "Ghost", emoji: "👻", chip: "bg-gray-200 text-gray-800 ring-1 ring-inset ring-gray-400" },
  disappointed: { label: "Disappointed", emoji: "😤", chip: "bg-coral-100 text-coral-800 ring-1 ring-inset ring-coral-400" },
  wavering: { label: "Wavering", emoji: "🪙", chip: "bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-400" },
  overwhelmed: { label: "Overwhelmed", emoji: "😵", chip: "bg-purple-100 text-purple-800 ring-1 ring-inset ring-purple-400" },
  healthy: { label: "On track", emoji: "—", chip: "bg-white text-slate-400 ring-1 ring-inset ring-slate-200" },
};

const DEMO_CSV_URL = "/demo-cohort-realistic.csv";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      {copied ? "Copied" : "Copy draft"}
    </button>
  );
}

interface UploadPanelProps {
  fileName: string | null;
  pasteValue: string;
  onPasteChange: (v: string) => void;
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onPasteLoad: () => void;
  validationError: CsvValidationResult | null;
}

function UploadPanel({
  fileName,
  pasteValue,
  onPasteChange,
  onFileSelect,
  onPasteLoad,
  validationError,
}: UploadPanelProps) {
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-700">Upload your sheet</div>
        <button
          type="button"
          onClick={downloadSampleCsv}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          Download sample CSV
        </button>
      </div>

      <label className="mb-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 hover:bg-slate-50">
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFileSelect} />
        {fileName ? `Loaded: ${fileName} — click to replace` : "Click to upload a .csv file"}
      </label>

      <div className="mb-1 text-xs text-slate-400">…or paste CSV text:</div>
      <textarea
        value={pasteValue}
        onChange={(e) => onPasteChange(e.target.value)}
        rows={4}
        placeholder="learner_id,name,sessions_attended_4wk,..."
        className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
      />
      <div className="mt-2">
        <button
          type="button"
          onClick={onPasteLoad}
          disabled={!pasteValue.trim()}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Load pasted CSV
        </button>
      </div>

      {validationError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {validationError.missingColumns.length > 0 ? (
            <>
              Missing column{validationError.missingColumns.length > 1 ? "s" : ""}:{" "}
              <strong>{validationError.missingColumns.join(", ")}</strong>. Download the sample
              CSV above to match the expected format.
            </>
          ) : (
            <>No learner rows found — check that your sheet has data below the header row.</>
          )}
        </div>
      )}

      <div className="mt-3 text-xs leading-relaxed text-slate-400">
        Expected columns (any order, any casing): <code className="font-mono">{EXPECTED_COLUMNS.join(", ")}</code>
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("demo");

  const [demoLearners, setDemoLearners] = useState<ClassifiedLearner[] | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);

  const [ownLearners, setOwnLearners] = useState<ClassifiedLearner[] | null>(null);
  const [ownFileName, setOwnFileName] = useState<string | null>(null);
  const [ownCsvText, setOwnCsvText] = useState("");
  const [ownValidationError, setOwnValidationError] = useState<CsvValidationResult | null>(null);

  const [narratives, setNarratives] = useState<Record<string, NarrativeState>>({});
  const [briefing, setBriefing] = useState<BriefingState>({ status: "idle" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load the demo cohort once, regardless of which mode is active, so
  // switching back to "Demo cohort" later is instant.
  useEffect(() => {
    fetch(DEMO_CSV_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load demo CSV (HTTP ${res.status})`);
        return res.text();
      })
      .then((csvText) => {
        const rows = parseLearnerRows(csvText);
        setDemoLearners(rows.map((row) => ({ row, result: classifyLearner(row) })));
      })
      .catch((e: Error) => setDemoError(e.message));
  }, []);

  const learners = useMemo(
    () => (mode === "demo" ? demoLearners : ownLearners),
    [mode, demoLearners, ownLearners]
  );

  // Whenever the active dataset changes (mode switch, or a freshly loaded
  // sheet), drop any per-learner AI state from the previous dataset and
  // kick off the Monday briefing. The briefing only ever sends derived
  // tier/archetype/fired-signal labels — never raw rows — so it stays
  // automatic. Per-learner drafts are opt-in (see "Generate AI take").
  useEffect(() => {
    setNarratives({});
    setExpandedId(null);

    if (!learners || learners.length === 0) {
      setBriefing({ status: "idle" });
      return;
    }

    setBriefing({ status: "loading" });
    fetchBriefing(
      learners.map(({ row, result }) => ({
        name: row.name,
        tier: result.tier,
        archetype: result.archetype,
        firedSignals: result.firedSignals,
      }))
    )
      .then((text) => setBriefing({ status: "done", text }))
      .catch((e: Error) => setBriefing({ status: "error", message: e.message }));
  }, [learners]);

  const sorted = useMemo(() => {
    if (!learners) return [];
    return [...learners].sort((a, b) => {
      const tierDiff = TIER_ORDER.indexOf(a.result.tier) - TIER_ORDER.indexOf(b.result.tier);
      if (tierDiff !== 0) return tierDiff;
      return a.row.name.localeCompare(b.row.name);
    });
  }, [learners]);

  const tierCounts = useMemo(() => {
    const counts: Record<Tier, number> = { red: 0, amber: 0, watch: 0, healthy: 0 };
    for (const l of learners ?? []) counts[l.result.tier]++;
    return counts;
  }, [learners]);

  function processOwnCsv(text: string) {
    const { validation, rows } = parseAndValidateCsv(text);
    if (!validation.ok) {
      setOwnValidationError(validation);
      setOwnLearners(null);
      return;
    }
    setOwnValidationError(null);
    setOwnLearners(rows.map((row) => ({ row, result: classifyLearner(row) })));
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setOwnFileName(file.name);
      processOwnCsv(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleGenerateNarrative(row: LearnerRow, result: ClassificationResult) {
    setNarratives((prev) => ({ ...prev, [row.learner_id]: { status: "loading" } }));
    fetchLearnerNarrative({
      name: row.name,
      tier: result.tier,
      archetype: result.archetype,
      firedSignals: result.firedSignals,
      raw: row,
    })
      .then((data) =>
        setNarratives((prev) => ({ ...prev, [row.learner_id]: { status: "done", data } }))
      )
      .catch((e: Error) =>
        setNarratives((prev) => ({ ...prev, [row.learner_id]: { status: "error", message: e.message } }))
      );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Learner-Health Radar</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tier and archetype come from a deterministic engine; the why, the drafts, and the
            briefing below come from claude-sonnet-4-6 narrating that decision — it never
            re-diagnoses anyone.
          </p>
        </header>

        <p className="mb-6 rounded-lg bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-500">
          🔒 Scoring (tiers and archetypes) runs entirely in your browser — your sheet is never
          sent anywhere to be scored. Clicking "Generate AI take" on a learner sends just that
          learner's row to Claude to write their why/draft; nothing is stored server-side.
        </p>

        <div className="mb-6 inline-flex rounded-lg border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setMode("demo")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === "demo" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Demo cohort
          </button>
          <button
            type="button"
            onClick={() => setMode("own")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === "own" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Use my own sheet
          </button>
        </div>

        {mode === "demo" && (
          <p className="mb-6 text-xs italic text-slate-400">
            Sample cohort: illustrates the workflow, not a validated prediction.
          </p>
        )}

        {mode === "demo" && demoError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {demoError}
          </div>
        )}

        {mode === "demo" && !demoError && !demoLearners && (
          <div className="text-sm text-slate-500">Loading demo cohort…</div>
        )}

        {mode === "own" && (
          <UploadPanel
            fileName={ownFileName}
            pasteValue={ownCsvText}
            onPasteChange={setOwnCsvText}
            onFileSelect={handleFileSelect}
            onPasteLoad={() => processOwnCsv(ownCsvText)}
            validationError={ownValidationError}
          />
        )}

        {mode === "own" && !ownLearners && !ownValidationError && (
          <div className="rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-400">
            Upload or paste a sheet above to see tiers, archetypes, and AI takes for your own
            cohort.
          </div>
        )}

        {learners && learners.length > 0 && (
          <>
            {/* Monday briefing (llm-layer-spec.md Section C) */}
            <div className="mb-6 rounded-xl border border-slate-200 bg-white px-5 py-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Monday briefing
              </div>
              {briefing.status === "loading" && (
                <div className="text-sm text-slate-400">Generating briefing…</div>
              )}
              {briefing.status === "error" && (
                <div className="text-sm text-slate-400">
                  AI layer unavailable ({briefing.message}). Add ANTHROPIC_API_KEY to a
                  project-root .env to enable it — the deterministic dashboard below works fine
                  without it.
                </div>
              )}
              {briefing.status === "done" && (
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{briefing.text}</pre>
              )}
            </div>

            {/* Tier strip */}
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TIER_ORDER.map((tier) => {
                const meta = TIER_META[tier];
                return (
                  <div key={tier} className={`rounded-xl px-4 py-3 ${meta.strip}`}>
                    <div className="text-xs font-medium uppercase tracking-wide opacity-80">
                      {meta.emoji} {meta.label}
                    </div>
                    <div className="mt-1 text-2xl font-semibold">{tierCounts[tier]}</div>
                  </div>
                );
              })}
            </div>

            {/* Learner list */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Learner</th>
                    <th className="px-4 py-3 font-medium">Tier</th>
                    <th className="px-4 py-3 font-medium">Archetype</th>
                    <th className="px-4 py-3 font-medium">Fired signals</th>
                    <th className="px-4 py-3 font-medium">AI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map(({ row, result }) => {
                    const tierMeta = TIER_META[result.tier];
                    const archetypeMeta = ARCHETYPE_META[result.archetype];
                    const isFlagged = NARRATIVE_TIERS.includes(result.tier);
                    const narrative = narratives[row.learner_id];
                    const isExpanded = expandedId === row.learner_id;
                    return (
                      <Fragment key={row.learner_id}>
                        <tr className="align-top">
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="font-medium text-slate-900">{row.name}</div>
                            <div className="text-xs text-slate-400">{row.learner_id}</div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tierMeta.chip}`}>
                              {tierMeta.emoji} {tierMeta.label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${archetypeMeta.chip}`}>
                              {archetypeMeta.emoji} {archetypeMeta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {result.firedSignals.length === 0 ? (
                              <span className="text-xs text-slate-400">No signals fired</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {result.firedSignals.map((signal, i) => (
                                  <span key={i} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                                    {signal}
                                  </span>
                                ))}
                              </div>
                            )}
                            {isFlagged && narrative?.status === "loading" && (
                              <div className="mt-2 text-xs italic text-slate-400">Generating why…</div>
                            )}
                            {isFlagged && narrative?.status === "error" && (
                              <div className="mt-2 text-xs italic text-slate-400">
                                AI layer unavailable ({narrative.message}).
                              </div>
                            )}
                            {isFlagged && narrative?.status === "done" && (
                              <div className="mt-2 text-xs italic text-slate-600">🤖 {narrative.data.why}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {!isFlagged && <span className="text-xs text-slate-300">—</span>}
                            {isFlagged && !narrative && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() => handleGenerateNarrative(row, result)}
                                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                >
                                  Generate AI take
                                </button>
                                <div className="mt-1 max-w-[10rem] text-[11px] leading-snug text-slate-400">
                                  Sends this row to Claude. Not stored.
                                </div>
                              </div>
                            )}
                            {isFlagged && narrative?.status === "loading" && (
                              <span className="text-xs text-slate-400">Generating…</span>
                            )}
                            {isFlagged && narrative?.status === "error" && (
                              <button
                                type="button"
                                onClick={() => handleGenerateNarrative(row, result)}
                                className="text-xs font-medium text-red-600 underline"
                              >
                                Retry
                              </button>
                            )}
                            {isFlagged && narrative?.status === "done" && (
                              <button
                                type="button"
                                onClick={() => setExpandedId(isExpanded ? null : row.learner_id)}
                                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                {isExpanded ? "Hide draft" : "View draft"}
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && narrative?.status === "done" && (
                          <tr className="bg-slate-50">
                            <td colSpan={5} className="px-4 py-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                                    Next touch: {narrative.data.next_touch}
                                    {narrative.data.archetype_confirm !== archetypeMeta.label && (
                                      <span className="ml-2 text-amber-600">
                                        (model flagged a possible override: {narrative.data.archetype_confirm})
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-slate-700">
                                    {narrative.data.draft}
                                  </p>
                                </div>
                                <CopyButton text={narrative.data.draft} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
