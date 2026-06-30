/**
 * engine.ts — Learner-Health Radar deterministic classifier
 * =============================================================
 * Implements Section 5 of learner-health-radar-build-spec.md, literally.
 *
 * This module is intentionally the only "smart" part of v1 that ships
 * without an LLM in the loop. It is plain, explainable rule evaluation:
 * no machine learning, no scoring functions, no invented thresholds
 * beyond the ones the spec names (and those are called out below).
 *
 * Scope note (per spec Section 5b, "Soft-sentiment proxy" + Section 6):
 * reading tone/forward-looking-ness out of the free-text `manager_note`
 * is explicitly the LLM narrative layer's job, not the deterministic
 * engine's. This module only ever reads `manager_note` for the
 * confirmation-only "fired signal" label text and the historical
 * `nps_status` field — it never parses the note for sentiment. When
 * `recent_ratings` and `nps_status` are both blank, sentiment is treated
 * as "no data" (neither red nor confirmed-fine) rather than guessed.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw input row, one learner snapshot, matching demo-cohort-realistic.csv. */
export interface LearnerRow {
  learner_id: string;
  name: string;
  sessions_attended_4wk: number;
  sessions_held_4wk: number;
  assignments_done: number;
  assignments_due: number;
  /** Comma-separated string of the last ~3 session ratings, oldest -> newest. May be empty. */
  recent_ratings: string;
  nps_status: "promoter" | "passive" | "detractor" | "";
  weeks_since_manager_contact: number;
  support_tickets_30d: number;
  fee_status: "on_time" | "late" | "extension_requested" | "";
  deferment_requests: number;
  whatsapp_active: boolean;
  manager_note: string;
}

/** Severity tier — "how fast" (spec 5c). */
export type Tier = "red" | "amber" | "watch" | "healthy";

/** Archetype — "what to do" (spec 5d). 'healthy' is a 5th, UI-only label
 *  for learners where no root or confirmation signal fired at all. */
export type Archetype =
  | "ghost"
  | "disappointed"
  | "wavering"
  | "overwhelmed"
  | "healthy";

export interface ClassificationResult {
  tier: Tier;
  archetype: Archetype;
  /** Human-readable list of every signal that evaluated true for this learner. */
  firedSignals: string[];
}

// ---------------------------------------------------------------------------
// Tunable thresholds (spec calls these out as v1 / tunable values)
// ---------------------------------------------------------------------------

/** Spec 5b: "< 4 for 2 consecutive sessions" is the sentiment-red rating trigger. */
const RATING_DIP_CEILING = 4;

/** Spec 5d/5c: contact >4 weeks = fully gone dark (Red, Ghost). */
const GONE_DARK_FULL_WEEKS = 4;

/** Spec 5d/5c: contact 3-4 weeks = the closing window (Amber, Ghost). */
const CLOSING_WINDOW_MIN_WEEKS = 3;
const CLOSING_WINDOW_MAX_WEEKS = 4;

/** Spec 5c: "contact current" = <=2 weeks since last manager contact. */
const CONTACT_CURRENT_MAX_WEEKS = 2;

/**
 * Spec 5a/5d: "irregular attendance" / "behind on work" (assignments done
 * vs due). The spec names these signals but doesn't pin a number, so v1
 * uses one consistent ratio for both: below 75% counts as behind/irregular.
 * Exactly 75% (e.g. 6/8) is treated as still on track, not behind.
 */
const BEHIND_RATIO_THRESHOLD = 0.75;

// ---------------------------------------------------------------------------
// Small parsing helpers
// ---------------------------------------------------------------------------

/** Parses the "3.6,3.4,3.3" recent_ratings string into numbers, oldest -> newest. */
function parseRatings(raw: string): number[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !Number.isNaN(n));
}

/** True if any two ADJACENT ratings (in given order) are both < ceiling. */
function hasTwoConsecutiveDips(ratings: number[], ceiling: number): boolean {
  for (let i = 0; i < ratings.length - 1; i++) {
    if (ratings[i] < ceiling && ratings[i + 1] < ceiling) return true;
  }
  return false;
}

/** True if exactly/at-least one rating dips below ceiling (used for the
 *  Amber "milder dip" clause — deliberately weaker than the 2-consecutive
 *  red trigger, and still rejects nothing here since the noise-rejection
 *  rule only protects against *escalation to Red*, not Amber.) */
function hasAnyDip(ratings: number[], ceiling: number): boolean {
  return ratings.some((r) => r < ceiling);
}

function ratio(done: number, total: number): number {
  if (!total || total <= 0) return 1; // no denominator => treat as not-behind
  return done / total;
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

export function classifyLearner(row: LearnerRow): ClassificationResult {
  const fired: string[] = [];

  const ratings = parseRatings(row.recent_ratings);
  const weeksSinceContact = row.weeks_since_manager_contact ?? 0;

  // --- Root #1: sentiment going negative (spec 5b sentiment-red trigger) ---
  // ">=2 consecutive ratings below 4" OR "nps_status === detractor".
  // Non-consecutive dips (e.g. 3.8, 4.6, 3.7) are deliberately NOT a trigger
  // — this is the noise-rejection rule.
  const consecutiveDip = hasTwoConsecutiveDips(ratings, RATING_DIP_CEILING);
  const isDetractor = row.nps_status === "detractor";
  const sentimentRedTrigger = consecutiveDip || isDetractor;

  if (consecutiveDip) {
    fired.push(
      `Sentiment red: 2 consecutive ratings below ${RATING_DIP_CEILING} (${ratings.join(", ")})`
    );
  }
  if (isDetractor) {
    fired.push("Sentiment red: NPS detractor");
  }

  // --- Root #2: contact going dark (spec 5b/5d gone-dark trigger) ---
  const goneDarkFull = weeksSinceContact > GONE_DARK_FULL_WEEKS;
  const goneDarkClosingWindow =
    weeksSinceContact >= CLOSING_WINDOW_MIN_WEEKS &&
    weeksSinceContact <= CLOSING_WINDOW_MAX_WEEKS;
  const contactCurrent = weeksSinceContact <= CONTACT_CURRENT_MAX_WEEKS;

  if (goneDarkFull) {
    fired.push(`Gone dark: ${weeksSinceContact} weeks with no manager contact`);
  } else if (goneDarkClosingWindow) {
    fired.push(`Closing window: ${weeksSinceContact} weeks with no manager contact`);
  }

  // --- Milder sentiment dip (feeds the Amber clause only, per 5c) ---
  // Weaker than the red trigger: a single non-consecutive rating dip, or an
  // NPS passive (lukewarm, not yet a detractor).
  const singleDip = !consecutiveDip && hasAnyDip(ratings, RATING_DIP_CEILING);
  const isPassive = row.nps_status === "passive";
  const milderSentimentDip = !sentimentRedTrigger && (singleDip || isPassive);

  if (milderSentimentDip && singleDip) {
    fired.push(`Milder sentiment dip: non-consecutive rating below ${RATING_DIP_CEILING} (${ratings.join(", ")})`);
  }
  if (milderSentimentDip && isPassive) {
    fired.push("Milder sentiment dip: NPS passive");
  }

  // --- Confirmation-only behavioural / commitment signals (spec 5a/5b) ---
  // On their own (sentiment fine + contact current) these never escalate
  // past Watch — they only push tier up when a root signal is also present.
  const attendanceRatio = ratio(row.sessions_attended_4wk, row.sessions_held_4wk);
  const assignmentRatio = ratio(row.assignments_done, row.assignments_due);

  const irregularAttendance = attendanceRatio < BEHIND_RATIO_THRESHOLD;
  const behindOnAssignments = assignmentRatio < BEHIND_RATIO_THRESHOLD;
  const behindOnWork = irregularAttendance || behindOnAssignments;

  const feeAtRisk = row.fee_status === "late" || row.fee_status === "extension_requested";
  const defermentsRising = row.deferment_requests > 0;
  const commitmentWobble = feeAtRisk || defermentsRising;

  // Disengagement confirmation: zero recent support tickets only reads as
  // "gone quiet" when paired with irregular attendance — on its own, zero
  // tickets is just a low-maintenance, healthy learner (see e.g. L07 Pooja).
  const lowSupportSignal = row.support_tickets_30d === 0 && irregularAttendance;

  if (irregularAttendance) {
    fired.push(
      `Irregular attendance: ${row.sessions_attended_4wk}/${row.sessions_held_4wk} sessions (4wk)`
    );
  }
  if (behindOnAssignments) {
    fired.push(`Behind on assignments: ${row.assignments_done}/${row.assignments_due} done`);
  }
  if (row.fee_status === "late") {
    fired.push("Commitment: fee payment late");
  }
  if (row.fee_status === "extension_requested") {
    fired.push("Commitment: fee extension requested");
  }
  if (defermentsRising) {
    fired.push(`Commitment: ${row.deferment_requests} deferment request(s)`);
  }
  if (lowSupportSignal) {
    fired.push(`Low support engagement: ${row.support_tickets_30d} tickets/30d alongside irregular attendance`);
  }

  const confirmationSignalFired = behindOnWork || commitmentWobble;

  // ---------------------------------------------------------------------
  // Severity tier (spec 5c) — evaluated top-down, first match wins.
  // ---------------------------------------------------------------------
  let tier: Tier;
  if (sentimentRedTrigger || goneDarkFull) {
    // Either root, alone, is enough. Gone-dark-full overrides a stale
    // "promoter" NPS — silence is itself the signal (spec 5b).
    tier = "red";
  } else if (goneDarkClosingWindow || (milderSentimentDip && confirmationSignalFired)) {
    tier = "amber";
  } else if (confirmationSignalFired && contactCurrent) {
    // Behavioural/commitment signal alone, sentiment fine, contact current
    // -> false-alarm guardrail keeps this at Watch, not higher.
    tier = "watch";
  } else {
    tier = "healthy";
  }

  // ---------------------------------------------------------------------
  // Archetype (spec 5d) — primary fork on contact state, then dominant
  // signal precedence. Computed independently of tier: a Watch-tier
  // learner can still carry a real archetype label (e.g. Overwhelmed)
  // even though the behavioural signal alone didn't escalate severity.
  // ---------------------------------------------------------------------
  let archetype: Archetype;
  if (goneDarkFull || goneDarkClosingWindow) {
    // Primary fork: contact state overrides everything else. You can't
    // diagnose further until contact is re-established.
    archetype = "ghost";
  } else if (sentimentRedTrigger) {
    archetype = "disappointed";
  } else if (commitmentWobble) {
    archetype = "wavering";
  } else if (behindOnWork) {
    archetype = "overwhelmed";
  } else {
    archetype = "healthy";
  }

  return { tier, archetype, firedSignals: fired };
}
