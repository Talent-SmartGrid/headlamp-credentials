import {describe, expect, it} from 'vitest';

import {
  buildEndorsementCredential,
  endorsementKindOf,
  ENDORSEMENT_KINDS,
  signCredential,
} from '../src/index.js';
import {
  ENDORSER,
  endorserKey,
  expectGolden,
  FIXED,
  stableJson,
} from './helpers.js';

describe('EndorsementCredential builder', () => {
  for (const kind of ENDORSEMENT_KINDS) {
    it(`golden: signed "${kind}" endorsement`, async () => {
      const unsigned = buildEndorsementCredential({
        credentialId: FIXED.endorsementId,
        kind,
        baseCredentialId: FIXED.credentialId,
        endorser: ENDORSER,
        validFrom: FIXED.validFrom,
      });
      const signed = await signCredential({
        credential: unsigned,
        key: await endorserKey(),
        proofDate: FIXED.proofDate,
      });
      expect(signed['type']).toEqual(['VerifiableCredential', 'EndorsementCredential']);
      const subject = signed['credentialSubject'] as Record<string, unknown>;
      expect(subject['id']).toBe(FIXED.credentialId);
      expect(subject['type']).toEqual(['EndorsementSubject']);
      expect(endorsementKindOf(signed)).toBe(kind);
      expectGolden(`endorsement-${kind}.json`, stableJson(signed));
    });
  }

  it('optional comment is appended to the standard statement', () => {
    const unsigned = buildEndorsementCredential({
      credentialId: FIXED.endorsementId,
      kind: 'would_hire',
      baseCredentialId: FIXED.credentialId,
      endorser: ENDORSER,
      validFrom: FIXED.validFrom,
      comment: 'Outstanding diagnostic skills.',
    });
    const subject = unsigned['credentialSubject'] as Record<string, unknown>;
    expect(subject['endorsementComment']).toMatch(/would hire/);
    expect(subject['endorsementComment']).toMatch(/Outstanding diagnostic skills\.$/);
  });
});
