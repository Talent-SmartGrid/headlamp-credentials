/**
 * Verification: signature validity (via @digitalbazaar/vc), validity window,
 * and revocation. All resolution goes through an injected document loader,
 * so the same code path serves online verification and offline bundles.
 */
import * as vc from '@digitalbazaar/vc';

import type {DocumentLoader} from './contexts.js';
import {verificationSuite} from './sign.js';
import {checkRevocation} from './statuslist.js';
import type {CredentialCheck, SignedCredential} from './types.js';

function flattenError(error: (Error & {errors?: Error[]}) | undefined): string[] {
  if (!error) return [];
  const nested = (error.errors ?? []).map(e => e.message);
  return nested.length > 0 ? nested : [error.message];
}

/**
 * Verify one signed credential: proof, validity window, revocation.
 *
 * @param options.now - Injectable clock (defaults to the real time).
 */
export async function verifyCredentialDocument(options: {
  credential: SignedCredential;
  documentLoader: DocumentLoader;
  now?: Date;
}): Promise<CredentialCheck> {
  const {credential, documentLoader} = options;
  const now = options.now ?? new Date();
  const errors: string[] = [];

  const result = await vc.verifyCredential({
    credential,
    suite: verificationSuite(),
    documentLoader,
    now,
    // Revocation is checked explicitly below via `checkRevocation`; this
    // stub only satisfies vc's requirement that credentials carrying a
    // `credentialStatus` supply a status hook.
    checkStatus: async () => ({verified: true}),
  });
  const signatureVerified = result.verified;
  if (!signatureVerified) {
    errors.push(...flattenError(result.error).map(m => `signature: ${m}`));
  }

  const validFrom = credential['validFrom'];
  const validUntil = credential['validUntil'];
  let withinValidity = true;
  if (typeof validFrom === 'string' && now < new Date(validFrom)) {
    withinValidity = false;
    errors.push(`validity: credential not valid before ${validFrom}`);
  }
  if (typeof validUntil === 'string' && now > new Date(validUntil)) {
    withinValidity = false;
    errors.push(`validity: credential expired at ${validUntil}`);
  }

  const revocation = await checkRevocation({credential, documentLoader});
  if (!revocation.ok) {
    errors.push(`status: ${revocation.error ?? 'revoked'}`);
  }
  const notRevoked = revocation.revoked === 'no-status' ? 'no-status' : !revocation.revoked;

  return {
    id: typeof credential.id === 'string' ? credential.id : undefined,
    signatureVerified,
    notRevoked: revocation.ok ? notRevoked : false,
    withinValidity,
    errors,
  };
}
