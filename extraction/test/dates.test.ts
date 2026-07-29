import {describe, expect, it} from 'vitest';
import {toIso} from '../src/index.js';

describe('toIso', () => {
  it('normalizes unambiguous formats', () => {
    expect(toIso('June 2, 2025')).toBe('2025-06-02');
    expect(toIso('2 June 2025')).toBe('2025-06-02');
    expect(toIso('Sept 30, 2025')).toBe('2025-09-30');
    expect(toIso('2025-06-02')).toBe('2025-06-02');
    expect(toIso('3rd March 2025')).toBe('2025-03-03');
    expect(toIso('14/10/2025')).toBe('2025-10-14');
    expect(toIso('10/14/2025')).toBe('2025-10-14');
  });

  it('abstains on year-less dates', () => {
    expect(toIso('14 Oct')).toBeUndefined();
    expect(toIso('8 Jan')).toBeUndefined();
    expect(toIso('October 14')).toBeUndefined();
  });

  it('abstains on ambiguous slash dates instead of assuming MM/DD', () => {
    expect(toIso('04/05/2025')).toBeUndefined();
  });

  it('rejects impossible dates', () => {
    expect(toIso('February 30, 2025')).toBeUndefined();
    expect(toIso('June 31, 2025')).toBeUndefined();
    expect(toIso('February 29, 2024')).toBe('2024-02-29');
    expect(toIso('February 29, 2025')).toBeUndefined();
  });

  it('abstains on prose that is not a date', () => {
    expect(toIso('Dear Marcus Delgado,')).toBeUndefined();
    expect(toIso('Week 15')).toBeUndefined();
  });
});
