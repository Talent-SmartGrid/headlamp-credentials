import {describe, expect, it} from 'vitest';

import {assertionText, formatDateRange, type EvidenceBasis} from '../src/index.js';
import {ATTESTATION, EVIDENCE, expectGolden, PLACEMENT} from './helpers.js';

describe('assertion-text engine', () => {
  it('documents-only asserts placement, never completion', () => {
    const text = assertionText(EVIDENCE.documents);
    expect(text).toBe(
      'Placed in a DoD SkillBridge at CoolSys Inc., January 6 – April 25, 2026. ' +
      'Offer letter and training plan verified by Headlamp.');
    expect(text).not.toContain('Completed');
    expectGolden('assertion-documents.txt', text + '\n');
  });

  it('attestation asserts completion, confirmed by the supervisor', () => {
    const text = assertionText(EVIDENCE.attestation);
    expect(text).toBe(
      'Completed a DoD SkillBridge at CoolSys Inc., January 6 – April 25, 2026. ' +
      'Confirmed by Dana Whitfield, Field Operations Manager.');
    expectGolden('assertion-attestation.txt', text + '\n');
  });

  it('both combines placement and completion', () => {
    const text = assertionText(EVIDENCE.both);
    expect(text).toBe(
      'Placed in a DoD SkillBridge at CoolSys Inc., January 6 – April 25, 2026. ' +
      'Offer letter and training plan verified by Headlamp. ' +
      'Completed a DoD SkillBridge at CoolSys Inc., January 6 – April 25, 2026. ' +
      'Confirmed by Dana Whitfield, Field Operations Manager.');
    expectGolden('assertion-both.txt', text + '\n');
  });

  it('completion language is structurally unreachable without an attestation', () => {
    // Compile-time guarantee, checked by `npm run typecheck`: the variants
    // that produce completion wording cannot be constructed without a
    // SupervisorAttestation object.

    // @ts-expect-error 'attestation' variant requires an attestation object
    const missing: EvidenceBasis = {basis: 'attestation', placement: PLACEMENT};
    // @ts-expect-error 'both' variant requires an attestation object
    const missingBoth: EvidenceBasis = {basis: 'both', placement: PLACEMENT};
    // @ts-expect-error 'documents' variant cannot smuggle in an attestation
    const extra: EvidenceBasis = {basis: 'documents', placement: PLACEMENT, attestation: ATTESTATION};
    void missing; void missingBoth; void extra;

    // Runtime cross-check: only attestation-bearing variants say "Completed".
    expect(assertionText(EVIDENCE.documents)).not.toContain('Completed');
    expect(assertionText(EVIDENCE.attestation)).toContain('Completed');
    expect(assertionText(EVIDENCE.both)).toContain('Completed');
  });

  it('formats cross-year date ranges with both years', () => {
    expect(formatDateRange('2025-11-03', '2026-02-20'))
      .toBe('November 3, 2025 – February 20, 2026');
  });

  it('rejects malformed dates', () => {
    expect(() => formatDateRange('2026-13-01', '2026-04-25')).toThrow();
    expect(() => formatDateRange('01/06/2026', '2026-04-25')).toThrow();
  });
});
