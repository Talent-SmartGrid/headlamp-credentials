/**
 * Signing — a thin wrapper over @digitalbazaar/vc + DataIntegrityProof with
 * the eddsa-rdfc-2022 cryptosuite (Ed25519 over RDFC-1.0 deterministic
 * JSON-LD canonicalization). We do not hand-roll any of this.
 */
import * as vc from '@digitalbazaar/vc';
import {DataIntegrityProof} from '@digitalbazaar/data-integrity';
import {cryptosuite as eddsaRdfc2022CryptoSuite} from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite';

import {createOfflineDocumentLoader, type DocumentLoader} from './contexts.js';
import type {KeyLike} from './keys.js';
import type {SignedCredential, UnsignedCredential} from './types.js';

/** The verification suite used everywhere in this library. */
export function verificationSuite(): unknown {
  return new DataIntegrityProof({cryptosuite: eddsaRdfc2022CryptoSuite});
}

/**
 * Sign a credential with an injected key.
 *
 * @param options.proofDate - Optional fixed `proof.created` timestamp.
 *   Ed25519 is deterministic, so fixing this makes the whole signed
 *   document reproducible byte-for-byte (used by golden tests).
 */
export async function signCredential(options: {
  credential: UnsignedCredential;
  key: KeyLike;
  proofDate?: string;
  documentLoader?: DocumentLoader;
}): Promise<SignedCredential> {
  // ⛔ THE CHECK IS "CAN THIS KEY PRODUCE A SIGNER", NOT "IS THERE A LOCAL
  // SECRET". It used to be `!options.key.secretKeyMultibase`, which was a
  // correct test only while every signer held its private key in this process.
  // A managed-key-service key (AWS KMS, GCP KMS) signs perfectly well and has
  // no `secretKeyMultibase` by construction — the guard would have rejected
  // the one arrangement where the private key is properly protected.
  //
  // Nothing is silently permitted by the change. A verification-only
  // Ed25519Multikey still fails loudly, one frame deeper, with the vendor's own
  // "A secret key is not available for signing." — see the test that pins it.
  if (typeof options.key?.signer !== 'function') {
    throw new Error('signCredential requires a key exposing signer()');
  }
  const suite = new DataIntegrityProof({
    signer: options.key.signer(),
    cryptosuite: eddsaRdfc2022CryptoSuite,
    date: options.proofDate ?? null,
  });
  const documentLoader = options.documentLoader ?? createOfflineDocumentLoader();
  const signed = await vc.issue({
    // vc.issue mutates its input; hand it a copy so builders stay pure.
    credential: structuredClone(options.credential),
    suite,
    documentLoader,
  });
  return signed as SignedCredential;
}
