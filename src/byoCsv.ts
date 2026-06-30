/**
 * byoCsv.ts — "bring your own sheet" CSV path.
 *
 * Separate from csv.ts on purpose: the demo path (parseLearnerRows) stays
 * exactly as it was. This module adds the things a real uploaded sheet
 * needs that the trusted demo CSV doesn't: header validation with a
 * friendly error, case/whitespace-tolerant header matching, and a
 * downloadable template that matches the schema exactly.
 *
 * Nothing here calls the network. Parsing + classification both run
 * entirely in the browser — see the privacy note rendered in App.tsx.
 */
import Papa from "papaparse";
import type { LearnerRow } from "./engine";
import { rawRowToLearnerRow, type RawRow } from "./csv";

/** The exact LearnerRow schema, in the demo CSV's column order. */
export const EXPECTED_COLUMNS: readonly (keyof LearnerRow)[] = [
  "learner_id",
  "name",
  "sessions_attended_4wk",
  "sessions_held_4wk",
  "assignments_done",
  "assignments_due",
  "recent_ratings",
  "nps_status",
  "weeks_since_manager_contact",
  "support_tickets_30d",
  "fee_status",
  "deferment_requests",
  "whatsapp_active",
  "manager_note",
];

export interface CsvValidationResult {
  ok: boolean;
  /** Expected columns that weren't found in the uploaded sheet's header row. */
  missingColumns: string[];
  /** How many data rows were found (after the header, before any parsing). */
  rowCount: number;
}

export interface ParsedOwnCsv {
  validation: CsvValidationResult;
  rows: LearnerRow[];
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

/**
 * Parses + validates an uploaded/pasted CSV against the expected schema.
 * Header matching is case- and whitespace-tolerant (so "Learner_ID" or
 * " learner_id " both match) — real-world sheets are messier than the
 * demo CSV. Column order doesn't matter.
 */
export function parseAndValidateCsv(csvText: string): ParsedOwnCsv {
  const { data, meta } = Papa.parse<RawRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });

  const dataRows = data.filter((r) => (r.learner_id ?? "").trim() !== "");
  const headerFields = new Set(meta.fields ?? []);
  const missingColumns = EXPECTED_COLUMNS.filter((c) => !headerFields.has(c));

  const validation: CsvValidationResult = {
    ok: missingColumns.length === 0 && dataRows.length > 0,
    missingColumns,
    rowCount: dataRows.length,
  };

  if (!validation.ok) {
    return { validation, rows: [] };
  }

  return { validation, rows: dataRows.map(rawRowToLearnerRow) };
}

/** Header row + a few blank rows, exactly matching EXPECTED_COLUMNS, for
 *  the "download sample CSV" link. */
export function buildSampleCsv(blankRows = 3): string {
  const header = EXPECTED_COLUMNS.join(",");
  const blank = EXPECTED_COLUMNS.map(() => "").join(",");
  const rows = Array.from({ length: blankRows }, () => blank);
  return [header, ...rows].join("\n") + "\n";
}

export function downloadSampleCsv(): void {
  const blob = new Blob([buildSampleCsv()], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "learner-health-radar-sample.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
