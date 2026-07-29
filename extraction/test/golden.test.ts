import {describe, expect, it} from 'vitest';
import {parseOfferLetter, parseTrainingPlan} from '../src/index.js';
import {checkGolden, fixtureNames, goldenNames, readFixture} from './helpers.js';

describe('golden files: training plans', () => {
  for (const name of fixtureNames('training-plans')) {
    it(name, () => {
      const result = parseTrainingPlan(readFixture('training-plans', name));
      checkGolden('training-plans', name, result);
    });
  }

  it('has no orphan goldens', () => {
    const expected = fixtureNames('training-plans').map((n) => n.replace(/\.txt$/, '.json'));
    expect(goldenNames('training-plans')).toEqual(expected);
  });
});

describe('golden files: offer letters', () => {
  for (const name of fixtureNames('offer-letters')) {
    it(name, () => {
      const result = parseOfferLetter(readFixture('offer-letters', name));
      checkGolden('offer-letters', name, result);
    });
  }

  it('has no orphan goldens', () => {
    const expected = fixtureNames('offer-letters').map((n) => n.replace(/\.txt$/, '.json'));
    expect(goldenNames('offer-letters')).toEqual(expected);
  });
});
