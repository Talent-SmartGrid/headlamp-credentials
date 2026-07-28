/**
 * Key handling — injection only.
 *
 * This library NEVER reads keys from disk, environment, or configuration.
 * Callers pass key material in explicitly; production secret storage is the
 * platform's job. `generateKeyPair` exists for provisioning and tests.
 */
import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import type {Ed25519Multikey as KeyPair} from '@digitalbazaar/ed25519-multikey';

export type {Ed25519Multikey as SigningKey} from '@digitalbazaar/ed25519-multikey';

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
