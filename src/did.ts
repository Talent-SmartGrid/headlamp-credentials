/**
 * did:web identity for the issuer.
 *
 * Key rotation is supported from day one: a DID document carries every
 * currently-valid verification method, and each proof names the specific key
 * id it was signed with. Rotating means adding `#key-N+1` to the document
 * (and later removing retired keys); previously issued credentials keep
 * verifying as long as their key remains listed — or via a bundle's DID
 * document snapshot after removal.
 */
import {DID_CONTEXT_URL} from './contexts.js';
import type {DidDocument} from './types.js';

const MULTIKEY_CONTEXT_V1_URL = 'https://w3id.org/security/multikey/v1';

/** Public half of a verification method to publish in the DID document. */
export interface PublicKeyEntry {
  /** Fragment naming the key, e.g. "key-1". Proofs reference `<did>#<fragment>`. */
  fragment: string;
  /** Multibase encoded Ed25519 public key. */
  publicKeyMultibase: string;
}

/** `didWeb('myheadlamp.com')` → `did:web:myheadlamp.com`. */
export function didWeb(domain: string, ...pathSegments: string[]): string {
  const encoded = [domain.replace(/:/g, '%3A'), ...pathSegments].map(encodeURIComponent);
  return `did:web:${encoded.join(':')}`;
}

/**
 * The HTTPS URL a did:web DID document must be served from.
 * `did:web:myheadlamp.com` → `https://myheadlamp.com/.well-known/did.json`.
 */
export function didWebDocumentUrl(did: string): string {
  const m = /^did:web:(.+)$/.exec(did);
  if (!m) throw new Error(`Not a did:web DID: ${did}`);
  const segments = m[1]!.split(':').map(decodeURIComponent);
  const host = segments.shift()!;
  return segments.length === 0
    ? `https://${host}/.well-known/did.json`
    : `https://${host}/${segments.join('/')}/did.json`;
}

/**
 * Generate the DID document to serve at the well-known path.
 * Pure function of the public keys — no key generation, no secrets.
 */
export function buildDidWebDocument(options: {
  /** Domain the DID is anchored to, e.g. "myheadlamp.com". */
  domain: string;
  /** Every currently-valid public key. Order is preserved. */
  publicKeys: PublicKeyEntry[];
}): DidDocument {
  if (options.publicKeys.length === 0) {
    throw new Error('A DID document needs at least one public key');
  }
  const fragments = new Set<string>();
  for (const {fragment} of options.publicKeys) {
    if (!/^[a-zA-Z0-9_-]+$/.test(fragment)) {
      throw new Error(`Invalid key fragment "${fragment}"`);
    }
    if (fragments.has(fragment)) {
      throw new Error(`Duplicate key fragment "${fragment}"`);
    }
    fragments.add(fragment);
  }
  const did = didWeb(options.domain);
  const verificationMethod = options.publicKeys.map(k => ({
    id: `${did}#${k.fragment}`,
    type: 'Multikey' as const,
    controller: did,
    publicKeyMultibase: k.publicKeyMultibase,
  }));
  const methodIds = verificationMethod.map(vm => vm.id);
  return {
    '@context': [DID_CONTEXT_URL, MULTIKEY_CONTEXT_V1_URL],
    id: did,
    verificationMethod,
    assertionMethod: methodIds,
    authentication: methodIds,
  };
}
