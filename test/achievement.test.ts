import {describe, expect, it} from 'vitest';

import {
  buildAchievementCredential,
  signCredential,
  type EvidenceBasis,
} from '../src/index.js';
import {
  EVIDENCE,
  expectGolden,
  FIXED,
  ISSUER,
  issuerKey1,
  stableJson,
} from './helpers.js';

async function signedCredentialFor(evidence: EvidenceBasis) {
  const credential = buildAchievementCredential({
    credentialId: FIXED.credentialId,
    subjectId: FIXED.subjectId,
    issuer: ISSUER,
    evidence,
    validFrom: FIXED.validFrom,
    validUntil: FIXED.validUntil,
    status: {statusListCredential: FIXED.statusListUrl, statusListIndex: 7},
  });
  return signCredential({credential, key: await issuerKey1(), proofDate: FIXED.proofDate});
}

describe('AchievementCredential builder', () => {
  for (const state of ['documents', 'attestation', 'both'] as const) {
    it(`golden: signed credential in evidence state "${state}"`, async () => {
      const signed = await signedCredentialFor(EVIDENCE[state]);
      expectGolden(`credential-${state}.json`, stableJson(signed));
    });
  }

  it('signing is deterministic: same inputs, byte-identical output', async () => {
    const a = await signedCredentialFor(EVIDENCE.both);
    const b = await signedCredentialFor(EVIDENCE.both);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('proof names the exact key id used (rotation-traceable)', async () => {
    const signed = await signedCredentialFor(EVIDENCE.documents);
    const proof = signed.proof as Record<string, unknown>;
    expect(proof['verificationMethod']).toBe('did:web:myheadlamp.com#key-1');
    expect(proof['type']).toBe('DataIntegrityProof');
    expect(proof['cryptosuite']).toBe('eddsa-rdfc-2022');
    expect(proof['proofPurpose']).toBe('assertionMethod');
  });

  it('builder is pure: does not mutate its params and never adds secrets', async () => {
    const evidence = structuredClone(EVIDENCE.both);
    const unsigned = buildAchievementCredential({
      credentialId: FIXED.credentialId,
      subjectId: FIXED.subjectId,
      issuer: ISSUER,
      evidence,
      validFrom: FIXED.validFrom,
    });
    expect(evidence).toEqual(EVIDENCE.both);
    expect(JSON.stringify(unsigned)).not.toContain('secretKey');
    expect('proof' in unsigned).toBe(false);
  });
});
