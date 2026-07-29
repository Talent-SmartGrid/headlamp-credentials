/**
 * Shared result types for the extraction prototype.
 *
 * Everything here is a *candidate* extraction from plain text. No taxonomy
 * mapping, no validation against live data — that happens platform-side.
 */

/** Where in the source document a skill candidate was found. */
export type SourceSection = 'curriculum_day' | 'skills_list' | 'responsibilities';

/**
 * A raw skill/tool label as it appeared in the document, with enough
 * context for a human reviewer (or the platform's taxonomy mapper) to
 * judge it. Labels are not normalized, deduplicated, or mapped.
 */
export interface SkillCandidate {
  label: string;
  sourceSection: SourceSection;
  /** Surrounding text snippet (whitespace-collapsed, truncated). */
  context: string;
}

/**
 * A date as captured from the document. `iso` (YYYY-MM-DD) is present only
 * when the raw text is unambiguous — e.g. "June 2, 2025". A day/month with
 * no year ("14 Oct") or an ambiguous slash date ("04/05/2025") keeps only
 * `raw`; the parser never guesses.
 */
export interface ExtractedDate {
  raw: string;
  iso?: string;
}

/** One `Day N:` bullet inside a course-style curriculum week. */
export interface CurriculumDay {
  day: number;
  text: string;
}

/**
 * One `Week N (dates): Title (NN hours)` section of a course-style plan.
 * Week numbers are reported exactly as printed — real plans skip weeks
 * (e.g. Week 12 then Week 15), so no sequence is ever assumed or repaired.
 */
export interface CurriculumWeek {
  week: number;
  dateRange?: string;
  title?: string;
  hours?: number;
  objective?: string;
  days: CurriculumDay[];
  /** Holiday lines, guest-speaker footnotes, and other stray copy. */
  notes: string[];
}

/** Fields for Format A — "course-style" training plans (e.g. Vets RISE). */
export interface CourseFields {
  participant?: string;
  trainingOutlineTitle?: string;
  duration?: string;
  location?: string;
  totalHours?: number;
  weeks: CurriculumWeek[];
  skillCandidates: SkillCandidate[];
}

/** Fields for Format B — "placement-style" training plans. */
export interface PlacementFields {
  participant?: string;
  host?: string;
  fellowshipStart?: ExtractedDate;
  fellowshipEnd?: ExtractedDate;
  /** From the `Instructor Qualification:` sentence. Omitted when the
   * sentence is present but does not match the expected shape — the
   * parser abstains rather than guessing at a name/title split. */
  supervisor?: {name: string; title: string};
  jobTitle?: string;
  jobDescription?: string;
  responsibilities: string[];
  weeklyHours?: number;
  skillCandidates: SkillCandidate[];
}

export type TrainingPlanResult =
  | {format: 'course'; confidence: number; fields: CourseFields}
  | {format: 'placement'; confidence: number; fields: PlacementFields}
  | {format: 'unknown'; confidence: 0; fields: Record<string, never>};

/** Result of parsing the Headlamp offer-letter template. */
export interface OfferLetterResult {
  letterDate?: ExtractedDate;
  host?: string;
  address?: string;
  startDate?: ExtractedDate;
  endDate?: ExtractedDate;
  roleTitle?: string;
  supervisor?: {name: string; title: string};
  dutiesRaw: string[];
  /** True iff the "[Host] intends to extend their own offer…" sentence is
   * present. Its absence is a legitimate template variant and does not
   * reduce confidence. */
  employmentIntent: boolean;
  /** True iff e-signature trail markers (`Doc ID:` / `Signed by`) appear. */
  signatureEvidence: boolean;
  confidence: number;
}
