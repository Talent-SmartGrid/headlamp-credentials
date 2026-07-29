import {describe, expect, it} from 'vitest';
import {parseTrainingPlan} from '../src/index.js';
import {readFixture} from './helpers.js';

const course = (name: string) => parseTrainingPlan(readFixture('training-plans', name));

describe('parseTrainingPlan: format detection', () => {
  it('detects course-style plans', () => {
    expect(course('course-basic.txt').format).toBe('course');
  });

  it('detects placement-style plans', () => {
    expect(course('placement-basic.txt').format).toBe('placement');
  });

  it('returns the exact unknown shape for non-plan documents', () => {
    for (const name of ['unknown-memo.txt', 'unknown-resume.txt']) {
      expect(course(name)).toEqual({format: 'unknown', confidence: 0, fields: {}});
    }
  });

  it('returns unknown for empty input', () => {
    expect(parseTrainingPlan('')).toEqual({format: 'unknown', confidence: 0, fields: {}});
  });

  it('does not classify an offer letter as a training plan', () => {
    const result = parseTrainingPlan(readFixture('offer-letters', 'offer-basic.txt'));
    expect(result.format).toBe('unknown');
  });
});

describe('parseTrainingPlan: course quirks', () => {
  it('preserves non-contiguous week numbers without repairing the sequence', () => {
    const result = course('course-quirks.txt');
    if (result.format !== 'course') throw new Error('expected course format');
    expect(result.fields.weeks.map((w) => w.week)).toEqual([11, 12, 15]);
  });

  it('routes holiday lines and guest-speaker footnotes into notes, not days', () => {
    const result = course('course-quirks.txt');
    if (result.format !== 'course') throw new Error('expected course format');
    const week12 = result.fields.weeks.find((w) => w.week === 12);
    expect(week12?.notes.some((n) => /Thanksgiving Holiday/.test(n))).toBe(true);
    expect(week12?.days).toHaveLength(3);
    const week15 = result.fields.weeks.find((w) => w.week === 15);
    expect(week15?.notes.some((n) => /Guest speaker/.test(n))).toBe(true);
  });

  it('tolerates a year-boundary week date range as a raw string', () => {
    const result = course('course-quirks.txt');
    if (result.format !== 'course') throw new Error('expected course format');
    expect(result.fields.weeks.find((w) => w.week === 15)?.dateRange).toBe('Dec 29 - Jan 2');
  });

  it('emits curriculum_day skill candidates with context', () => {
    const result = course('course-basic.txt');
    if (result.format !== 'course') throw new Error('expected course format');
    const trello = result.fields.skillCandidates.find((c) => c.label === 'Mastering Trello');
    expect(trello?.sourceSection).toBe('curriculum_day');
    expect(trello?.context).toContain('Week 1, Day 2');
    expect(result.fields.skillCandidates.some((c) => c.label === 'MS Power BI')).toBe(true);
    expect(
      result.fields.skillCandidates.some((c) => c.label === 'Green Belt Foundations'),
    ).toBe(true);
  });

  it('scores a sparse header lower than a complete one', () => {
    const full = course('course-basic.txt');
    const sparse = course('course-sparse-header.txt');
    expect(sparse.confidence).toBeLessThan(full.confidence);
    expect(full.confidence).toBe(1);
  });
});

describe('parseTrainingPlan: placement', () => {
  it('extracts the skills list and responsibilities as separate candidate sections', () => {
    const result = course('placement-basic.txt');
    if (result.format !== 'placement') throw new Error('expected placement format');
    const sections = new Set(result.fields.skillCandidates.map((c) => c.sourceSection));
    expect(sections).toEqual(new Set(['skills_list', 'responsibilities']));
    expect(
      result.fields.skillCandidates.some(
        (c) => c.label === 'Technical Insight & Analysis' && c.sourceSection === 'skills_list',
      ),
    ).toBe(true);
  });

  it('keeps year-boundary fellowship dates raw, without inventing a year', () => {
    const result = course('placement-year-boundary.txt');
    if (result.format !== 'placement') throw new Error('expected placement format');
    expect(result.fields.fellowshipStart).toEqual({raw: '14 Oct'});
    expect(result.fields.fellowshipEnd).toEqual({raw: '8 Jan'});
  });

  it('normalizes fully-specified fellowship dates to ISO', () => {
    const result = course('placement-basic.txt');
    if (result.format !== 'placement') throw new Error('expected placement format');
    expect(result.fields.fellowshipStart).toEqual({raw: 'June 2, 2025', iso: '2025-06-02'});
    expect(result.fields.fellowshipEnd).toEqual({raw: 'August 22, 2025', iso: '2025-08-22'});
  });

  it('abstains from the supervisor field when no individual is named', () => {
    const result = course('placement-degraded.txt');
    if (result.format !== 'placement') throw new Error('expected placement format');
    expect(result.fields.supervisor).toBeUndefined();
    expect(result.confidence).toBeLessThan(course('placement-basic.txt').confidence);
  });
});
