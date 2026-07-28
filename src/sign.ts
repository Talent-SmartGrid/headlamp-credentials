/**
 * Signing — a thin wrapper over @digitalbazaar/vc + DataIntegrityProof with
 * the eddsa-rdfc-2022 cryptosuite (Ed25519 over RDFC-1.0 deterministic
 * JSON-LD canonicalization). We do not hand-roll any of this.
 */
import * as vc from '@digitalbazaar/vc';
import {DataIntegrityProof} from '@digitalbazaar/data-integrity';
import {cryptosuite as eddsaRdfc2022CryptoSuite} from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite';

import {createOfflineDocumentLoader, type DocumentLoader} from './contexts.js';
import type {SigningKey} from './keys.js';
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
  key: SigningKey;
  proofDate?: string;
  documentLoader?: DocumentLoader;
}): Promise<SignedCredential> {
  if (!options.key.secretKeyMultibase) {
    throw new Error('signCredential requires a key with secret material');
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
