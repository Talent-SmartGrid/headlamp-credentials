/**
 * The assertion-text engine: a pure function of `EvidenceBasis` with exactly
 * three patterns. Completion language lives only in `completionSentence`,
 * whose signature demands a `SupervisorAttestation` — there is no code path
 * (and no type-level path) to completion wording without one.
 */
import type {EvidenceBasis, IsoDate, PlacementDetails, SupervisorAttestation} from './types.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function formatDate(iso: IsoDate, omitYear = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Expected ISO date (YYYY-MM-DD), got "${iso}"`);
  const [, year, month, day] = m;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) throw new Error(`Invalid month in "${iso}"`);
  const d = Number(day);
  if (d < 1 || d > 31) throw new Error(`Invalid day in "${iso}"`);
  return omitYear ? `${monthName} ${d}` : `${monthName} ${d}, ${Number(year)}`;
}

/** "January 6 – April 25, 2026" (same year) or "November 3, 2025 – February 20, 2026". */
export function formatDateRange(start: IsoDate, end: IsoDate): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDate(start, sameYear)} – ${formatDate(end)}`;
}

function placementSentence(p: PlacementDetails): string {
  const dates = formatDateRange(p.startDate, p.endDate);
  return `Placed in a DoD SkillBridge at ${p.hostOrganization}, ${dates}. ` +
    'Offer letter and training plan verified by Headlamp.';
}

function completionSentence(p: PlacementDetails, a: SupervisorAttestation): string {
  const dates = formatDateRange(p.startDate, p.endDate);
  return `Completed a DoD SkillBridge at ${p.hostOrganization}, ${dates}. ` +
    `Confirmed by ${a.supervisorName}, ${a.supervisorTitle}.`;
}

/**
 * The assertion text for a credential. Exactly three patterns:
 *
 * - documents:   placement only.
 * - attestation: completion, confirmed by the supervisor.
 * - both:        placement sentence followed by completion sentence.
 */
export function assertionText(evidence: EvidenceBasis): string {
  switch (evidence.basis) {
    case 'documents':
      return placementSentence(evidence.placement);
    case 'attestation':
      return completionSentence(evidence.placement, evidence.attestation);
    case 'both':
      return `${placementSentence(evidence.placement)} ` +
        `${completionSentence(evidence.placement, evidence.attestation)}`;
  }
}
