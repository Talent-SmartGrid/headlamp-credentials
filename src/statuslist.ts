/**
 * Revocation via W3C Bitstring Status List (adopted from
 * @digitalbazaar/vc-bitstring-status-list, not hand-rolled).
 *
 * Publishing model: the platform periodically builds a fresh signed status
 * list credential from its set of revoked indices and serves it at a stable
 * URL. Verifiers resolve that URL (online) or use the snapshot embedded in
 * an offline bundle.
 */
import {
  checkStatus as bitstringCheckStatus,
  createCredential,
  createList,
} from '@digitalbazaar/vc-bitstring-status-list';

import {VC_V2_CONTEXT_URL, type DocumentLoader} from './contexts.js';
import type {KeyLike} from './keys.js';
import {signCredential} from './sign.js';
import {verificationSuite} from './sign.js';
import type {IsoDateTime, IssuerProfile, SignedCredential} from './types.js';

export const DEFAULT_STATUS_LIST_LENGTH = 131072; // spec minimum for herd privacy

/**
 * Build (or refresh) a signed Bitstring Status List credential.
 * Call again with the current `revokedIndices` set to publish an update.
 */
export async function buildStatusListCredential(options: {
  /** Stable URL the platform serves this list from. */
  id: string;
  issuer: IssuerProfile;
  key: KeyLike;
  revokedIndices?: number[];
  length?: number;
  validFrom: IsoDateTime;
  proofDate?: string;
}): Promise<SignedCredential> {
  const length = options.length ?? DEFAULT_STATUS_LIST_LENGTH;
  const list = await createList({length});
  for (const index of options.revokedIndices ?? []) {
    if (!Number.isInteger(index) || index < 0 || index >= length) {
      throw new Error(`Revoked index ${index} out of range [0, ${length})`);
    }
    list.setStatus(index, true);
  }
  const credential = await createCredential({
    id: options.id,
    list,
    statusPurpose: 'revocation',
    context: [VC_V2_CONTEXT_URL],
  });
  credential['issuer'] = {
    id: options.issuer.id,
    name: options.issuer.name,
  };
  credential['validFrom'] = options.validFrom;
  return signCredential({
    credential: credential as SignedCredential,
    key: options.key,
    ...(options.proofDate !== undefined ? {proofDate: options.proofDate} : {}),
  });
}

/**
 * Check a credential's revocation status against its published (or
 * snapshotted) status list, verifying the status list's own signature.
 *
 * Returns `revoked: 'no-status'` when the credential carries no
 * BitstringStatusListEntry at all.
 */
export async function checkRevocation(options: {
  credential: SignedCredential;
  documentLoader: DocumentLoader;
}): Promise<{ok: boolean; revoked: boolean | 'no-status'; error?: string}> {
  const status = options.credential['credentialStatus'];
  if (status === undefined) {
    return {ok: true, revoked: 'no-status'};
  }
  const result = await bitstringCheckStatus({
    credential: options.credential,
    documentLoader: options.documentLoader,
    suite: verificationSuite(),
    verifyBitstringStatusListCredential: true,
    verifyMatchingIssuers: true,
  });
  if (!result.verified) {
    return {ok: false, revoked: true, error: result.error?.message ?? 'status check failed'};
  }
  // checkStatus "verified" only means the list resolved and its signature
  // held; a set bit still means REVOKED.
  const revoked = (result.results ?? []).some(r => r.status === true);
  return {ok: !revoked, revoked, ...(revoked ? {error: 'credential has been revoked'} : {})};
}
