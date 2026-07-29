import {describe, expect, it} from 'vitest';
import {parseOfferLetter} from '../src/index.js';
import {readFixture} from './helpers.js';

const offer = (name: string) => parseOfferLetter(readFixture('offer-letters', name));

describe('parseOfferLetter', () => {
  it('parses the full template', () => {
    const result = offer('offer-basic.txt');
    expect(result.host).toBe('Ironvale Energy Services');
    expect(result.address).toBe('4100 Range Road, Odessa, TX 79762');
    expect(result.startDate).toEqual({raw: 'June 2, 2025', iso: '2025-06-02'});
    expect(result.endDate).toEqual({raw: 'August 22, 2025', iso: '2025-08-22'});
    expect(result.roleTitle).toBe('Wind Turbine Technician Fellow');
    expect(result.supervisor).toEqual({
      name: 'Dana Whitfield',
      title: 'Director of Field Operations',
    });
    expect(result.dutiesRaw).toHaveLength(4);
    expect(result.employmentIntent).toBe(true);
    expect(result.signatureEvidence).toBe(true);
    expect(result.confidence).toBe(1);
  });

  it('handles "an" role articles and keeps year-less dates raw', () => {
    const result = offer('offer-year-boundary.txt');
    expect(result.roleTitle).toBe('Intermodal Operations Fellow');
    expect(result.startDate).toEqual({raw: '14 October'});
    expect(result.endDate).toEqual({raw: '8 January'});
  });

  it('treats a missing employment-intent sentence as false without a confidence penalty', () => {
    const result = offer('offer-no-intent.txt');
    expect(result.employmentIntent).toBe(false);
    expect(result.confidence).toBe(1);
  });

  it('reports missing signature markers and supervisor honestly', () => {
    const result = offer('offer-unsigned-degraded.txt');
    expect(result.signatureEvidence).toBe(false);
    expect(result.supervisor).toBeUndefined();
    expect(result.confidence).toBeLessThan(offer('offer-basic.txt').confidence);
  });

  it('returns near-zero confidence on a non-offer document', () => {
    const result = parseOfferLetter(readFixture('training-plans', 'course-basic.txt'));
    expect(result.confidence).toBeLessThanOrEqual(0.1);
    expect(result.dutiesRaw).toEqual([]);
    expect(result.employmentIntent).toBe(false);
    expect(result.signatureEvidence).toBe(false);
  });

  it('handles empty input', () => {
    const result = parseOfferLetter('');
    expect(result.confidence).toBe(0);
    expect(result.host).toBeUndefined();
  });
});
