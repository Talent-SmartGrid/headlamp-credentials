import {describe, expect, it} from 'vitest';

import {
  buildAchievementCredential,
  buildStatusListCredential,
  checkRevocation,
  createOfflineDocumentLoader,
  signCredential,
} from '../src/index.js';
import {
  EVIDENCE,
  FIXED,
  ISSUER,
  issuerDidDocument,
  issuerKey1,
} from './helpers.js';

async function statusList(revokedIndices: number[]) {
  return buildStatusListCredential({
    id: FIXED.statusListUrl,
    issuer: ISSUER,
    key: await issuerKey1(),
    revokedIndices,
    validFrom: FIXED.validFrom,
    proofDate: FIXED.proofDate,
  });
}

async function credentialAtIndex(index: number) {
  const unsigned = buildAchievementCredential({
    credentialId: FIXED.credentialId,
    subjectId: FIXED.subjectId,
    issuer: ISSUER,
    evidence: EVIDENCE.documents,
    validFrom: FIXED.validFrom,
    status: {statusListCredential: FIXED.statusListUrl, statusListIndex: index},
  });
  return signCredential({credential: unsigned, key: await issuerKey1(), proofDate: FIXED.proofDate});
}

describe('bitstring status list (revocation)', () => {
  it('builds a signed status list credential of spec-minimum length', async () => {
    const sl = await statusList([]);
    expect(sl['type']).toEqual(['VerifiableCredential', 'BitstringStatusListCredential']);
    const subject = sl['credentialSubject'] as Record<string, unknown>;
    expect(subject['type']).toBe('BitstringStatusList');
    expect(subject['statusPurpose']).toBe('revocation');
    expect(typeof subject['encodedList']).toBe('string');
  });

  it('a credential whose bit is clear verifies as not revoked', async () => {
    const loader = createOfflineDocumentLoader({
      didDocuments: [issuerDidDocument()],
      extraDocuments: [await statusList([99, 12345])],
    });
    const result = await checkRevocation({credential: await credentialAtIndex(7), documentLoader: loader});
    expect(result).toMatchObject({ok: true, revoked: false});
  });

  it('a credential whose bit is set is revoked', async () => {
    const loader = createOfflineDocumentLoader({
      didDocuments: [issuerDidDocument()],
      extraDocuments: [await statusList([7])],
    });
    const result = await checkRevocation({credential: await credentialAtIndex(7), documentLoader: loader});
    expect(result.ok).toBe(false);
    expect(result.revoked).toBe(true);
  });

  it('refreshing the list flips revocation without touching the credential', async () => {
    const credential = await credentialAtIndex(42);
    const before = createOfflineDocumentLoader({
      didDocuments: [issuerDidDocument()],
      extraDocuments: [await statusList([])],
    });
    const after = createOfflineDocumentLoader({
      didDocuments: [issuerDidDocument()],
      extraDocuments: [await statusList([42])],
    });
    expect((await checkRevocation({credential, documentLoader: before})).ok).toBe(true);
    expect((await checkRevocation({credential, documentLoader: after})).ok).toBe(false);
  });

  it('a credential with no status entry reports no-status', async () => {
    const unsigned = buildAchievementCredential({
      credentialId: FIXED.credentialId,
      subjectId: FIXED.subjectId,
      issuer: ISSUER,
      evidence: EVIDENCE.documents,
      validFrom: FIXED.validFrom,
    });
    const credential = await signCredential({credential: unsigned, key: await issuerKey1()});
    const loader = createOfflineDocumentLoader({didDocuments: [issuerDidDocument()]});
    const result = await checkRevocation({credential, documentLoader: loader});
    expect(result).toEqual({ok: true, revoked: 'no-status'});
  });

  it('rejects out-of-range revocation indices', async () => {
    await expect(statusList([-1])).rejects.toThrow(/out of range/);
    await expect(statusList([999999999])).rejects.toThrow(/out of range/);
  });
});
