import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  buildAchievementCredential,
  buildBundle,
  buildEndorsementCredential,
  buildStatusListCredential,
  signCredential,
  verifyBundle,
  type CredentialBundle,
  type SignedCredential,
} from '../src/index.js';
import {
  ENDORSER,
  endorserDidDocument,
  endorserKey,
  EVIDENCE,
  expectGolden,
  FIXED,
  ISSUER,
  issuerDidDocument,
  issuerKey1,
  stableJson,
} from './helpers.js';

async function makeBundleParts() {
  const key = await issuerKey1();
  const statusListCredential = await buildStatusListCredential({
    id: FIXED.statusListUrl,
    issuer: ISSUER,
    key,
    revokedIndices: [],
    validFrom: FIXED.validFrom,
    proofDate: FIXED.proofDate,
  });
  const credential = await signCredential({
    credential: buildAchievementCredential({
      credentialId: FIXED.credentialId,
      subjectId: FIXED.subjectId,
      issuer: ISSUER,
      evidence: EVIDENCE.both,
      validFrom: FIXED.validFrom,
      validUntil: FIXED.validUntil,
      status: {statusListCredential: FIXED.statusListUrl, statusListIndex: 7},
    }),
    key,
    proofDate: FIXED.proofDate,
  });
  const endorsement = await signCredential({
    credential: buildEndorsementCredential({
      credentialId: FIXED.endorsementId,
      kind: 'work_confirmed',
      baseCredentialId: FIXED.credentialId,
      endorser: ENDORSER,
      validFrom: FIXED.validFrom,
    }),
    key: await endorserKey(),
    proofDate: FIXED.proofDate,
  });
  return {credential, endorsement, statusListCredential};
}

function fullBundle(parts: Awaited<ReturnType<typeof makeBundleParts>>): CredentialBundle {
  return buildBundle({
    credential: parts.credential,
    endorsements: [parts.endorsement],
    didDocuments: [issuerDidDocument(), endorserDidDocument()],
    statusListCredentials: [parts.statusListCredential],
  });
}

describe('offline bundle: verification with ALL network access stubbed to fail', () => {
  const originals = {
    fetch: globalThis.fetch,
    httpRequest: http.request,
    httpsRequest: https.request,
    httpGet: http.get,
    httpsGet: https.get,
    netConnect: net.connect,
  };

  beforeEach(() => {
    const die = (what: string) => () => {
      throw new Error(`NETWORK CALL ATTEMPTED (${what}) during offline verification`);
    };
    globalThis.fetch = die('fetch') as unknown as typeof fetch;
    http.request = die('http.request') as unknown as typeof http.request;
    https.request = die('https.request') as unknown as typeof https.request;
    http.get = die('http.get') as unknown as typeof http.get;
    https.get = die('https.get') as unknown as typeof https.get;
    net.connect = die('net.connect') as unknown as typeof net.connect;
  });

  afterEach(() => {
    globalThis.fetch = originals.fetch;
    http.request = originals.httpRequest;
    https.request = originals.httpsRequest;
    http.get = originals.httpGet;
    https.get = originals.httpsGet;
    net.connect = originals.netConnect;
  });

  it('verify(bundle) passes with zero network access', async () => {
    const bundle = fullBundle(await makeBundleParts());
    const result = await verifyBundle(bundle, {now: FIXED.now});
    expect(result.errors).toEqual([]);
    expect(result.credential.errors).toEqual([]);
    expect(result.verified).toBe(true);
    expect(result.credential.signatureVerified).toBe(true);
    expect(result.credential.notRevoked).toBe(true);
    expect(result.endorsements).toHaveLength(1);
    expect(result.endorsements[0]).toMatchObject({
      signatureVerified: true,
      referencesCredential: true,
      kind: 'work_confirmed',
    });
  });

  it('fails offline when the credential is revoked in the snapshot', async () => {
    const parts = await makeBundleParts();
    const revokedList = await buildStatusListCredential({
      id: FIXED.statusListUrl,
      issuer: ISSUER,
      key: await issuerKey1(),
      revokedIndices: [7],
      validFrom: FIXED.validFrom,
      proofDate: FIXED.proofDate,
    });
    const bundle = buildBundle({
      credential: parts.credential,
      endorsements: [],
      didDocuments: [issuerDidDocument()],
      statusListCredentials: [revokedList],
    });
    const result = await verifyBundle(bundle, {now: FIXED.now});
    expect(result.verified).toBe(false);
    expect(result.credential.notRevoked).toBe(false);
  });

  it('fails offline when an endorsement references a different credential', async () => {
    const parts = await makeBundleParts();
    const strayEndorsement = await signCredential({
      credential: buildEndorsementCredential({
        credentialId: FIXED.endorsementId,
        kind: 'would_hire',
        baseCredentialId: 'urn:uuid:00000000-0000-4000-8000-00000000dead',
        endorser: ENDORSER,
        validFrom: FIXED.validFrom,
      }),
      key: await endorserKey(),
      proofDate: FIXED.proofDate,
    });
    const bundle = fullBundle(parts);
    bundle.endorsements.push(strayEndorsement);
    const result = await verifyBundle(bundle, {now: FIXED.now});
    expect(result.verified).toBe(false);
    expect(result.endorsements[1]?.referencesCredential).toBe(false);
  });

  it('rejects malformed bundle JSON with a structural error', async () => {
    const result = await verifyBundle({format: 'something-else'});
    expect(result.verified).toBe(false);
    expect(result.errors[0]).toMatch(/bundle\.format/);
  });

  it('golden: full bundle', async () => {
    const bundle = fullBundle(await makeBundleParts());
    expectGolden('bundle-full.json', stableJson(bundle));
  });
});

describe('display control: exclusion is absence', () => {
  it('excluded endorsement produces a bundle byte-identical to one where it never existed', async () => {
    const partsA = await makeBundleParts();
    const partsB = await makeBundleParts();

    // World A: the would_hire endorsement was NEVER ISSUED.
    const bundleNeverIssued = buildBundle({
      credential: partsA.credential,
      endorsements: [],
      didDocuments: [issuerDidDocument()],
      statusListCredentials: [partsA.statusListCredential],
    });

    // World B: the endorsement WAS issued, then EXCLUDED by the holder.
    const issuedButExcluded = await signCredential({
      credential: buildEndorsementCredential({
        credentialId: FIXED.endorsementId,
        kind: 'would_hire',
        baseCredentialId: FIXED.credentialId,
        endorser: ENDORSER,
        validFrom: FIXED.validFrom,
      }),
      key: await endorserKey(),
      proofDate: FIXED.proofDate,
    });
    expect(issuedButExcluded.proof).toBeDefined(); // it really exists
    const bundleExcluded = buildBundle({
      credential: partsB.credential,
      endorsements: [], // holder chose not to disclose it
      didDocuments: [issuerDidDocument()],
      statusListCredentials: [partsB.statusListCredential],
    });

    // Byte-for-byte indistinguishable (deterministic Ed25519 + fixed
    // timestamps make this exact, with no "modulo" carve-outs needed).
    expect(JSON.stringify(bundleExcluded)).toBe(JSON.stringify(bundleNeverIssued));
  });

  it('no field anywhere in a bundle hints at hidden or excluded content', async () => {
    const bundle = fullBundle(await makeBundleParts());
    const keys: string[] = [];
    JSON.stringify(bundle, (key, value: unknown) => {
      keys.push(key.toLowerCase());
      return value;
    });
    for (const forbidden of ['hidden', 'excluded', 'suppressed', 'redacted', 'omitted']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('both verify successfully; the only observable difference is the endorsement list', async () => {
    const parts = await makeBundleParts();
    const withEndorsement = fullBundle(parts);
    const withoutEndorsement = buildBundle({
      credential: parts.credential,
      endorsements: [],
      didDocuments: [issuerDidDocument(), endorserDidDocument()],
      statusListCredentials: [parts.statusListCredential],
    });
    const a = await verifyBundle(withEndorsement, {now: FIXED.now});
    const b = await verifyBundle(withoutEndorsement, {now: FIXED.now});
    expect(a.verified).toBe(true);
    expect(b.verified).toBe(true);
    expect(a.endorsements).toHaveLength(1);
    expect(b.endorsements).toHaveLength(0);
  });
});

describe('key material discipline', () => {
  it('no artifact in a bundle contains secret key material', async () => {
    const {fixtureKeys} = await import('./helpers.js');
    const bundle = fullBundle(await makeBundleParts());
    const json = JSON.stringify(bundle);
    for (const key of [fixtureKeys.issuerKey1, fixtureKeys.issuerKey2, fixtureKeys.endorserKey]) {
      expect(json).not.toContain(key.secretKeyMultibase);
    }
    expect(json).not.toContain('secretKeyMultibase');
  });

  it('signing without secret material is refused', async () => {
    const {importKey} = await import('../src/index.js');
    const {fixtureKeys} = await import('./helpers.js');
    const publicOnly = await importKey({
      id: fixtureKeys.issuerKey1.id,
      controller: fixtureKeys.issuerKey1.controller,
      publicKeyMultibase: fixtureKeys.issuerKey1.publicKeyMultibase,
    });
    const unsigned = buildAchievementCredential({
      credentialId: FIXED.credentialId,
      subjectId: FIXED.subjectId,
      issuer: ISSUER,
      evidence: EVIDENCE.documents,
      validFrom: FIXED.validFrom,
    });
    await expect(signCredential({credential: unsigned, key: publicOnly}))
      .rejects.toThrow(/secret/);
  });
});

describe('bundle golden determinism', () => {
  it('two independent builds of the same bundle are byte-identical', async () => {
    const a = fullBundle(await makeBundleParts()) as unknown as SignedCredential;
    const b = fullBundle(await makeBundleParts()) as unknown as SignedCredential;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
