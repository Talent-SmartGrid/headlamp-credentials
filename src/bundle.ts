/**
 * Offline verification bundles.
 *
 * A bundle is a single JSON file carrying the credential, the endorsements
 * the holder chose to share, and snapshots of every document verification
 * needs: issuer/endorser DID documents (public key material) and status
 * list credentials. `verifyBundle` resolves exclusively against the bundle
 * plus vendored contexts — zero network access, by construction.
 *
 * Display control: the builder includes exactly the endorsements it is
 * handed. No hidden/excluded marker exists in the format; an endorsement
 * left out is byte-for-byte indistinguishable from one never issued.
 */
import {bundleDocumentLoader} from './contexts.js';
import {endorsementKindOf} from './endorsement.js';
import type {
  BundleVerificationResult,
  CredentialBundle,
  DidDocument,
  SignedCredential,
} from './types.js';
import {verifyCredentialDocument} from './verify.js';

/** Assemble a bundle. Pure — no signing, no network, no reordering. */
export function buildBundle(options: {
  credential: SignedCredential;
  /** Exactly the endorsements to disclose. Order is preserved. */
  endorsements?: SignedCredential[];
  /** DID document snapshots for the issuer and every endorser. */
  didDocuments: DidDocument[];
  /** Status list snapshots for any credential that carries a status entry. */
  statusListCredentials?: SignedCredential[];
}): CredentialBundle {
  return {
    format: 'headlamp-credential-bundle',
    version: '0.1',
    credential: options.credential,
    endorsements: options.endorsements ?? [],
    didDocuments: options.didDocuments,
    statusListCredentials: options.statusListCredentials ?? [],
  };
}

/** Runtime shape check for externally supplied bundle JSON. */
export function assertBundleShape(value: unknown): asserts value is CredentialBundle {
  const b = value as Partial<CredentialBundle> | null;
  if (!b || typeof b !== 'object') throw new Error('bundle must be a JSON object');
  if (b.format !== 'headlamp-credential-bundle') {
    throw new Error('bundle.format must be "headlamp-credential-bundle"');
  }
  if (b.version !== '0.1') throw new Error(`unsupported bundle version "${String(b.version)}"`);
  if (!b.credential || typeof b.credential !== 'object') {
    throw new Error('bundle.credential missing');
  }
  if (!Array.isArray(b.endorsements)) throw new Error('bundle.endorsements must be an array');
  if (!Array.isArray(b.didDocuments) || b.didDocuments.length === 0) {
    throw new Error('bundle.didDocuments must be a non-empty array');
  }
  if (!Array.isArray(b.statusListCredentials)) {
    throw new Error('bundle.statusListCredentials must be an array');
  }
}

/**
 * Verify a bundle with zero network access: credential proof, validity
 * window, revocation (against the snapshot), every included endorsement's
 * proof, and that each endorsement references the bundled credential.
 */
export async function verifyBundle(
  bundleInput: unknown,
  options: {now?: Date} = {},
): Promise<BundleVerificationResult> {
  const errors: string[] = [];
  let bundle: CredentialBundle;
  try {
    assertBundleShape(bundleInput);
    bundle = bundleInput;
  } catch (e) {
    return {
      verified: false,
      credential: {
        id: undefined,
        signatureVerified: false,
        notRevoked: false,
        withinValidity: false,
        errors: [],
      },
      endorsements: [],
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }

  const documentLoader = bundleDocumentLoader(bundle);
  const nowOption = options.now !== undefined ? {now: options.now} : {};

  const credential = await verifyCredentialDocument({
    credential: bundle.credential,
    documentLoader,
    ...nowOption,
  });

  const endorsements = await Promise.all(
    bundle.endorsements.map(async endorsement => {
      const check = await verifyCredentialDocument({
        credential: endorsement,
        documentLoader,
        ...nowOption,
      });
      const subject = endorsement['credentialSubject'] as {id?: unknown} | undefined;
      const referencesCredential = subject?.id === bundle.credential.id;
      if (!referencesCredential) {
        check.errors.push(
          `endorsement ${String(endorsement.id)} does not reference the bundled credential`);
      }
      const kind = endorsementKindOf(endorsement);
      return {...check, referencesCredential, ...(kind ? {kind} : {})};
    }),
  );

  const credentialOk =
    credential.signatureVerified && credential.withinValidity &&
    credential.notRevoked !== false;
  const endorsementsOk = endorsements.every(
    e => e.signatureVerified && e.withinValidity && e.notRevoked !== false &&
      e.referencesCredential);

  return {
    verified: credentialOk && endorsementsOk,
    credential,
    endorsements,
    errors,
  };
}
