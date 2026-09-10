/**
 * A key whose private half never enters this process.
 *
 * This is the managed-key-service (AWS KMS / GCP KMS) arrangement: the platform
 * holds a key HANDLE, the service signs, and `secretKeyMultibase` does not and
 * cannot exist. The tests below are the guard on the one failure mode that is
 * invisible at issuing time — a signature that is well-formed here and rejected
 * by every conforming verifier elsewhere.
 *
 * The fake service deliberately signs with `node:crypto`, NOT with
 * `@digitalbazaar/ed25519-multikey`. If both sides used the vendor's own
 * primitive, the tests would prove only that the library agrees with itself.
 */
import {createPrivateKey, sign as nodeSign, createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';

import {
  buildAchievementCredential,
  buildDidWebDocument,
  buildStatusListCredential,
  createOfflineDocumentLoader,
  importKey,
  publicKeyMultibaseFromRaw,
  signCredential,
  verifyCredentialDocument,
  type CredentialSigner,
  type KeyLike,
} from '../src/index.js';
import {EVIDENCE, FIXED, ISSUER, fixtureKeys, issuerKey2} from './helpers.js';

const DID = 'did:web:myheadlamp.com';

/** PKCS#8 wrapper for a raw Ed25519 seed — RFC 8410 §7, fixed prefix. */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** The raw 32-byte public and secret halves of the committed key-2 fixture. */
async function key2Raw(): Promise<{publicKey: Uint8Array; secretKey: Uint8Array}> {
  const key = await importKey(fixtureKeys.issuerKey2);
  const raw = await (key as unknown as {
    export(o: {publicKey: boolean; secretKey: boolean; raw: boolean; canonicalize: boolean}):
      Promise<{publicKey: Uint8Array; secretKey: Uint8Array}>;
  }).export({publicKey: true, secretKey: true, raw: true, canonicalize: true});
  return raw;
}

/**
 * A fake managed key service. `sign` is the vendor call: it receives the exact
 * bytes and returns the raw 64-byte signature, exactly as AWS KMS does for
 * `SigningAlgorithm: ED25519_SHA_512` with `MessageType: RAW`.
 */
function fakeKms(secretSeed: Uint8Array, options: {prehash?: boolean} = {}) {
  const pkcs8 = Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(secretSeed)]);
  const privateKey = createPrivateKey({key: pkcs8, format: 'der', type: 'pkcs8'});
  const seen: number[] = [];
  return {
    seenByteLengths: seen,
    sign(data: Uint8Array): Uint8Array {
      seen.push(data.length);
      // `prehash` models AWS's ED25519_PH_SHA_512 — the wrong choice.
      const message = options.prehash
        ? createHash('sha512').update(Buffer.from(data)).digest()
        : Buffer.from(data);
      return new Uint8Array(nodeSign(null, message, privateKey));
    },
  };
}

/** Build the KeyLike the platform would hand to signCredential. */
function kmsKeyLike(
  kms: ReturnType<typeof fakeKms>,
  publicKeyMultibase: string,
  fragment = 'key-2',
): KeyLike {
  return {
    id: `${DID}#${fragment}`,
    controller: DID,
    publicKeyMultibase,
    signer(): CredentialSigner {
      return {
        id: `${DID}#${fragment}`,
        algorithm: 'Ed25519',
        sign: async ({data}) => kms.sign(data),
      };
    },
  };
}

function loaderFor(publicKeyMultibase: string, fragment = 'key-2') {
  return createOfflineDocumentLoader({
    didDocuments: [buildDidWebDocument({
      domain: 'myheadlamp.com',
      publicKeys: [{fragment, publicKeyMultibase}],
    })],
  });
}

/** The house pattern: `proof` is typed as one-or-many, so narrow it. */
function proofOf(signed: {proof: Record<string, unknown> | Record<string, unknown>[]}) {
  return signed.proof as Record<string, unknown>;
}

function unsignedCredential() {
  return buildAchievementCredential({
    credentialId: FIXED.credentialId,
    subjectId: FIXED.subjectId,
    issuer: ISSUER,
    evidence: EVIDENCE.both,
    validFrom: FIXED.validFrom,
    validUntil: FIXED.validUntil,
  });
}

describe('publicKeyMultibaseFromRaw', () => {
  it('re-encodes a committed key byte-identically to the multikey encoder', async () => {
    const {publicKey} = await key2Raw();
    expect(publicKey).toHaveLength(32);
    // The fixed vector: the committed fixture's own multibase string.
    expect(await publicKeyMultibaseFromRaw(publicKey))
      .toBe(fixtureKeys.issuerKey2.publicKeyMultibase);
  });

  it('produces a z6Mk multikey (0xed 0x01 multicodec header)', async () => {
    const {publicKey} = await key2Raw();
    expect(await publicKeyMultibaseFromRaw(publicKey)).toMatch(/^z6Mk/);
  });

  it('refuses anything that is not the raw 32 bytes', async () => {
    const {publicKey} = await key2Raw();
    // A one-byte-short slice is exactly the off-by-one a bad DER slice makes.
    await expect(publicKeyMultibaseFromRaw(publicKey.slice(0, 31))).rejects.toThrow(/32-byte/);
    await expect(publicKeyMultibaseFromRaw(publicKey.slice(1))).rejects.toThrow(/32-byte/);
    // The full 44-byte DER SubjectPublicKeyInfo, unsliced.
    await expect(publicKeyMultibaseFromRaw(new Uint8Array(44))).rejects.toThrow(/32-byte/);
  });
});

describe('signing with an externally-held key', () => {
  it('signs a credential that verifies against the published DID document', async () => {
    const {publicKey, secretKey} = await key2Raw();
    const mb = await publicKeyMultibaseFromRaw(publicKey);
    const kms = fakeKms(secretKey);

    const signed = await signCredential({
      credential: unsignedCredential(),
      key: kmsKeyLike(kms, mb),
      proofDate: FIXED.proofDate,
    });

    expect(proofOf(signed)['cryptosuite']).toBe('eddsa-rdfc-2022');
    expect(proofOf(signed)['verificationMethod']).toBe(`${DID}#key-2`);

    const check = await verifyCredentialDocument({
      credential: signed,
      documentLoader: loaderFor(mb),
      now: FIXED.now,
    });
    expect(check.errors).toEqual([]);
    expect(check.signatureVerified).toBe(true);
  });

  it('is handed exactly 64 bytes — the suite hashes, the signer must not', async () => {
    const {publicKey, secretKey} = await key2Raw();
    const kms = fakeKms(secretKey);
    await signCredential({
      credential: unsignedCredential(),
      key: kmsKeyLike(kms, await publicKeyMultibaseFromRaw(publicKey)),
      proofDate: FIXED.proofDate,
    });
    // proof-config hash (32) || document hash (32). Far under the 4096-byte
    // limit a managed service imposes on RAW messages.
    expect(kms.seenByteLengths).toEqual([64]);
  });

  it('produces the SAME document as the local key — the path is interchangeable', async () => {
    const {publicKey, secretKey} = await key2Raw();
    const external = await signCredential({
      credential: unsignedCredential(),
      key: kmsKeyLike(fakeKms(secretKey), await publicKeyMultibaseFromRaw(publicKey)),
      proofDate: FIXED.proofDate,
    });
    const local = await signCredential({
      credential: unsignedCredential(),
      key: await issuerKey2(),
      proofDate: FIXED.proofDate,
    });
    // Ed25519 is deterministic, so identical inputs must give identical bytes.
    expect(JSON.stringify(external)).toBe(JSON.stringify(local));
  });

  it('signs a status list credential too', async () => {
    const {publicKey, secretKey} = await key2Raw();
    const mb = await publicKeyMultibaseFromRaw(publicKey);
    const list = await buildStatusListCredential({
      id: FIXED.statusListUrl,
      issuer: ISSUER,
      key: kmsKeyLike(fakeKms(secretKey), mb),
      revokedIndices: [3, 17],
      validFrom: FIXED.validFrom,
      proofDate: FIXED.proofDate,
    });
    const check = await verifyCredentialDocument({
      credential: list,
      documentLoader: loaderFor(mb),
      now: FIXED.now,
    });
    expect(check.signatureVerified).toBe(true);
  });
});

describe('the failures that would otherwise be silent', () => {
  it('REJECTS a pre-hashed signature (the ED25519_PH_SHA_512 mistake)', async () => {
    const {publicKey, secretKey} = await key2Raw();
    const mb = await publicKeyMultibaseFromRaw(publicKey);
    // Signing succeeds and the document looks perfectly well-formed...
    const signed = await signCredential({
      credential: unsignedCredential(),
      key: kmsKeyLike(fakeKms(secretKey, {prehash: true}), mb),
      proofDate: FIXED.proofDate,
    });
    expect(proofOf(signed)['proofValue']).toBeTruthy();
    // ...and verifies nowhere. This is why the end-to-end check exists.
    const check = await verifyCredentialDocument({
      credential: signed, documentLoader: loaderFor(mb), now: FIXED.now,
    });
    expect(check.signatureVerified).toBe(false);
  });

  it('REJECTS a signature whose key id is not the published one', async () => {
    const {publicKey, secretKey} = await key2Raw();
    const mb = await publicKeyMultibaseFromRaw(publicKey);
    const signed = await signCredential({
      credential: unsignedCredential(),
      // Signs as #key-3, but the document below publishes only #key-2.
      key: kmsKeyLike(fakeKms(secretKey), mb, 'key-3'),
      proofDate: FIXED.proofDate,
    });
    expect(proofOf(signed)['verificationMethod']).toBe(`${DID}#key-3`);
    const check = await verifyCredentialDocument({
      credential: signed, documentLoader: loaderFor(mb, 'key-2'), now: FIXED.now,
    });
    expect(check.signatureVerified).toBe(false);
  });

  it('REJECTS a signature made by a different key than the one published', async () => {
    const {publicKey} = await key2Raw();
    const other = await importKey(fixtureKeys.issuerKey1);
    const otherRaw = await (other as unknown as {
      export(o: Record<string, boolean>): Promise<{secretKey: Uint8Array}>;
    }).export({publicKey: true, secretKey: true, raw: true, canonicalize: true});
    const signed = await signCredential({
      credential: unsignedCredential(),
      // key-1's secret, published as key-2's public.
      key: kmsKeyLike(fakeKms(otherRaw.secretKey), await publicKeyMultibaseFromRaw(publicKey)),
      proofDate: FIXED.proofDate,
    });
    const check = await verifyCredentialDocument({
      credential: signed,
      documentLoader: loaderFor(await publicKeyMultibaseFromRaw(publicKey)),
      now: FIXED.now,
    });
    expect(check.signatureVerified).toBe(false);
  });
});

describe('keys that cannot sign still fail loudly', () => {
  it('rejects a key with no signer() at all', async () => {
    await expect(signCredential({
      credential: unsignedCredential(),
      key: {publicKeyMultibase: fixtureKeys.issuerKey2.publicKeyMultibase} as unknown as KeyLike,
    })).rejects.toThrow(/signer\(\)/);
  });

  it('rejects a verification-only key, with the vendor error one frame deeper', async () => {
    // No secretKeyMultibase — the case the old guard caught. It must still fail.
    const verifyOnly = await importKey({
      id: `${DID}#key-2`,
      controller: DID,
      publicKeyMultibase: fixtureKeys.issuerKey2.publicKeyMultibase,
    });
    await expect(signCredential({
      credential: unsignedCredential(),
      key: verifyOnly,
    })).rejects.toThrow(/secret key is not available/i);
  });
});
