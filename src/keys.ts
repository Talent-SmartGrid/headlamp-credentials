/**
 * Key handling — injection only.
 *
 * This library NEVER reads keys from disk, environment, or configuration.
 * Callers pass key material in explicitly; production secret storage is the
 * platform's job. `generateKeyPair` exists for provisioning and tests.
 *
 * TWO KINDS OF SIGNING KEY, ONE INTERFACE.
 * Until now the only signer was an `Ed25519Multikey` holding local secret
 * material. A managed key service (AWS KMS, Google Cloud KMS) never releases
 * the private key at all: the platform holds a key HANDLE and asks the service
 * to sign. Such a key has no `secretKeyMultibase` and can never have one.
 *
 * `KeyLike` is the interface both satisfy, and it is all this library actually
 * needs — `signCredential` only ever calls `key.signer()` and hands the result
 * to `DataIntegrityProof`. Typing on the capability rather than on one concrete
 * class is what lets the platform move signing off-box without this library
 * learning anything about any vendor.
 */
import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import type {Ed25519Multikey as KeyPair} from '@digitalbazaar/ed25519-multikey';

export type {Ed25519Multikey as SigningKey} from '@digitalbazaar/ed25519-multikey';

/**
 * The signer `DataIntegrityProof` drives.
 *
 * ⛔ `sign` receives the EXACT BYTES TO SIGN and must return the RAW signature.
 * For `eddsa-rdfc-2022` that is the 64-byte concatenation of the proof-config
 * hash and the document hash, signed with PURE Ed25519 (RFC 8032) — the
 * algorithm hashes internally. An implementation that pre-hashes `data` before
 * signing, or that returns anything but the raw 64-byte signature, produces a
 * document that fails verification on every conforming verifier while looking
 * perfectly well-formed here.
 *
 * `id` MUST equal the verification-method id published in the issuer's DID
 * document, because it is written into `proof.verificationMethod` and is how a
 * verifier chooses which published key to check against.
 */
export interface CredentialSigner {
  /** Verification method id, e.g. "did:web:myheadlamp.com#key-2". */
  id: string;
  algorithm: 'Ed25519';
  /** Sign the given bytes as-is. Returns the raw 64-byte Ed25519 signature. */
  sign(options: {data: Uint8Array}): Promise<Uint8Array>;
}

/**
 * Anything this library can sign with: a locally-held `Ed25519Multikey`, or a
 * key whose private half lives in a managed key service and is reached through
 * `signer()`.
 *
 * `secretKeyMultibase` is OPTIONAL and its absence carries no meaning — an
 * externally-held key is fully capable of signing and simply has no local
 * secret to name.
 */
export interface KeyLike {
  /** Verification method id, e.g. "did:web:myheadlamp.com#key-2". */
  id?: string | undefined;
  /** Controller DID, e.g. "did:web:myheadlamp.com". */
  controller?: string | undefined;
  /** Multibase (z-base58btc) encoded public key. */
  publicKeyMultibase: string;
  /** Present only for locally-held keys. Never for a managed-service key. */
  secretKeyMultibase?: string | undefined;
  signer(): CredentialSigner;
}

/** Serialized Ed25519 key material, as stored in the platform's secret store. */
export interface KeyMaterial {
  /** Verification method id this key signs as, e.g. "did:web:myheadlamp.com#key-1". */
  id: string;
  /** Controller DID, e.g. "did:web:myheadlamp.com". */
  controller: string;
  /** Multibase (z-base58btc) encoded public key. */
  publicKeyMultibase: string;
  /** Multibase encoded secret key. Omit for verification-only use. */
  secretKeyMultibase?: string;
}

/**
 * Import injected key material into a signing-capable key object.
 * The only way this library ever obtains a private key.
 */
export async function importKey(material: KeyMaterial): Promise<KeyPair> {
  if (!material.id || !material.controller || !material.publicKeyMultibase) {
    throw new Error('importKey requires id, controller, and publicKeyMultibase');
  }
  return Ed25519Multikey.from({type: 'Multikey', ...material});
}

/**
 * Generate a fresh Ed25519 key pair. For provisioning a new production key
 * (write the result straight into the secret store) and for tests.
 * Never commit generated secret keys to a repository.
 */
export async function generateKeyPair(options: {
  id: string;
  controller: string;
}): Promise<{keyPair: KeyPair; material: Required<KeyMaterial>}> {
  const keyPair = await Ed25519Multikey.generate({
    id: options.id,
    controller: options.controller,
  });
  const exported = await keyPair.export({publicKey: true, secretKey: true});
  return {
    keyPair,
    material: {
      id: options.id,
      controller: options.controller,
      publicKeyMultibase: exported['publicKeyMultibase'] as string,
      secretKeyMultibase: exported['secretKeyMultibase'] as string,
    },
  };
}

/**
 * Encode a raw 32-byte Ed25519 public key as a multibase (`z6Mk…`) Multikey
 * string, through the SAME `@digitalbazaar/ed25519-multikey` code path that
 * `generateKeyPair` uses.
 *
 * WHY THIS EXISTS RATHER THAN A CALLER DOING IT. A managed key service hands
 * back a public key as DER `SubjectPublicKeyInfo` bytes, not multibase. The
 * platform must publish that key in the same DID document as keys this library
 * generated, so the two encodings have to agree EXACTLY — a multibase string
 * that differs by one byte publishes a key that verifies nothing. Re-deriving
 * the multicodec header and base58btc alphabet at the call site is precisely
 * how that drift happens, so the encoding stays here, next to the code it must
 * match.
 *
 * Takes the RAW 32 bytes. Stripping the DER wrapper is the caller's job,
 * because the wrapper is a property of the vendor API, not of Ed25519.
 */
export async function publicKeyMultibaseFromRaw(publicKey: Uint8Array): Promise<string> {
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) {
    throw new Error(
      `publicKeyMultibaseFromRaw requires the raw 32-byte Ed25519 public key ` +
      `(got ${publicKey instanceof Uint8Array ? `${publicKey.length} bytes` : typeof publicKey})`,
    );
  }
  const key = await Ed25519Multikey.fromJwk({
    jwk: {kty: 'OKP', crv: 'Ed25519', x: base64url(publicKey)},
    secretKey: false,
  });
  return key.publicKeyMultibase;
}

/** base64url without padding. Kept dependency-free and Buffer-free. */
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
