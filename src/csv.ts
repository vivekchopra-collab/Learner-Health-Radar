/**
 * csv.ts — turns the raw demo CSV into typed LearnerRow objects.
 *
 * This is pure data-loading/coercion, deliberately kept separate from
 * engine.ts: the engine should only ever see well-typed rows, never raw
 * CSV strings.
 */
import Papa from "papaparse";
import type { LearnerRow } from "./engine";

export type RawRow = Record<string, string>;

function toNumber(v: string | undefined): number {
  const n = parseFloat((v ?? "").trim());
  return Number.isNaN(n) ? 0 : n;
}

function toNpsStatus(v: string | undefined): LearnerRow["nps_status"] {
  const s = (v ?? "").trim().toLowerCase();
  return s === "promoter" || s === "passive" || s === "detractor" ? s : "";
}

function toFeeStatus(v: string | undefined): LearnerRow["fee_status"] {
  const s = (v ?? "").trim().toLowerCase();
  return s === "on_time" || s === "late" || s === "extension_requested" ? s : "";
}

function toBool(v: string | undefined): boolean {
  return (v ?? "").trim().toLowerCase() === "true";
}

export function rawRowToLearnerRow(r: RawRow): LearnerRow {
  return {
    learner_id: (r.learner_id ?? "").trim(),
    name: (r.name ?? "").trim(),
    sessions_attended_4wk: toNumber(r.sessions_attended_4wk),
    sessions_held_4wk: toNumber(r.sessions_held_4wk),
    assignments_done: toNumber(r.assignments_done),
    assignments_due: toNumber(r.assignments_due),
    recent_ratings: (r.recent_ratings ?? "").trim(),
    nps_status: toNpsStatus(r.nps_status),
    weeks_since_manager_contact: toNumber(r.weeks_since_manager_contact),
    support_tickets_30d: toNumber(r.support_tickets_30d),
    fee_status: toFeeStatus(r.fee_status),
    deferment_requests: toNumber(r.deferment_requests),
    whatsapp_active: toBool(r.whatsapp_active),
    manager_note: (r.manager_note ?? "").trim(),
  };
}

export function parseLearnerRows(csvText: string): LearnerRow[] {
  const { data } = Papa.parse<RawRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return data
    .filter((r) => (r.learner_id ?? "").trim() !== "")
    .map(rawRowToLearnerRow);
}
