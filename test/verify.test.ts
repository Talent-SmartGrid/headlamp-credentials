import {describe, expect, it} from 'vitest';

import {
  buildAchievementCredential,
  createOfflineDocumentLoader,
  signCredential,
  verifyCredentialDocument,
  type SignedCredential,
} from '../src/index.js';
import {
  EVIDENCE,
  FIXED,
  ISSUER,
  issuerDidDocument,
  issuerKey1,
  issuerKey2,
} from './helpers.js';

function loader() {
  return createOfflineDocumentLoader({didDocuments: [issuerDidDocument()]});
}

async function signedCredential(overrides: Record<string, unknown> = {}, useKey2 = false) {
  const unsigned = {
    ...buildAchievementCredential({
      credentialId: FIXED.credentialId,
      subjectId: FIXED.subjectId,
      issuer: ISSUER,
      evidence: EVIDENCE.both,
      validFrom: FIXED.validFrom,
      validUntil: FIXED.validUntil,
    }),
    ...overrides,
  };
  const key = useKey2 ? await issuerKey2() : await issuerKey1();
  return signCredential({credential: unsigned, key, proofDate: FIXED.proofDate});
}

describe('verification', () => {
  it('verifies a valid credential', async () => {
    const check = await verifyCredentialDocument({
      credential: await signedCredential(),
      documentLoader: loader(),
      now: FIXED.now,
    });
    expect(check.errors).toEqual([]);
    expect(check.signatureVerified).toBe(true);
    expect(check.withinValidity).toBe(true);
    expect(check.notRevoked).toBe('no-status');
  });

  it('verifies a credential signed with the rotated key (#key-2)', async () => {
    const credential = await signedCredential({}, true);
    expect((credential.proof as Record<string, unknown>)['verificationMethod'])
      .toBe('did:web:myheadlamp.com#key-2');
    const check = await verifyCredentialDocument({
      credential,
      documentLoader: loader(),
      now: FIXED.now,
    });
    expect(check.signatureVerified).toBe(true);
  });

  it('rejects a tampered credential', async () => {
    const credential = await signedCredential();
    const tampered = structuredClone(credential) as SignedCredential;
    const evidence = (tampered['evidence'] as Record<string, unknown>[])[0]!;
    evidence['narrative'] = (evidence['narrative'] as string).replace('Placed', 'Completed');
    const check = await verifyCredentialDocument({
      credential: tampered,
      documentLoader: loader(),
      now: FIXED.now,
    });
    expect(check.signatureVerified).toBe(false);
    expect(check.errors.length).toBeGreaterThan(0);
  });

  it('rejects a credential signed by a key absent from the DID document', async () => {
    // Simulate key retirement: DID document lists only key-1, proof names key-2.
    const didDoc = issuerDidDocument();
    didDoc.verificationMethod = didDoc.verificationMethod.filter(vm => vm.id.endsWith('#key-1'));
    didDoc.assertionMethod = didDoc.assertionMethod.filter(id => id.endsWith('#key-1'));
    didDoc.authentication = didDoc.assertionMethod;
    const check = await verifyCredentialDocument({
      credential: await signedCredential({}, true),
      documentLoader: createOfflineDocumentLoader({didDocuments: [didDoc]}),
      now: FIXED.now,
    });
    expect(check.signatureVerified).toBe(false);
  });

  it('rejects an expired credential', async () => {
    const check = await verifyCredentialDocument({
      credential: await signedCredential({validUntil: '2026-05-15T00:00:00Z'}),
      documentLoader: loader(),
      now: new Date('2026-05-16T00:00:00Z'),
    });
    expect(check.withinValidity).toBe(false);
    expect(check.errors.join(' ')).toMatch(/expired/);
  });

  it('rejects a not-yet-valid credential', async () => {
    const check = await verifyCredentialDocument({
      credential: await signedCredential(),
      documentLoader: loader(),
      now: new Date('2026-04-01T00:00:00Z'),
    });
    expect(check.withinValidity).toBe(false);
  });
});
