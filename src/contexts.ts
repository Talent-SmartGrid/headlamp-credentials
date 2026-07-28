/**
 * Static JSON-LD context store and document loaders.
 *
 * Every context this library ever needs is vendored via npm packages and
 * served from memory — signing and verification never fetch a context from
 * the network. Canonicalization (RDFC-1.0) therefore behaves identically
 * online and offline.
 */
import {contexts as credentialsContexts, named as credentialsNamed} from '@digitalbazaar/credentials-context';
import {contexts as dataIntegrityContexts} from '@digitalbazaar/data-integrity-context';
import {contexts as multikeyContexts} from '@digitalbazaar/multikey-context';
import {contexts as statusListContexts} from '@digitalbazaar/vc-bitstring-status-list-context';
import didContext from 'did-context';
import {contexts as obContexts, CONTEXT_URL_V3_0_3} from '@digitalcredentials/open-badges-context';

import type {CredentialBundle, DidDocument, SignedCredential} from './types.js';

export const VC_V2_CONTEXT_URL = credentialsNamed.get('v2')!.id;
export const OB_V3_CONTEXT_URL = CONTEXT_URL_V3_0_3;
export const DID_CONTEXT_URL = didContext.constants.DID_CONTEXT_URL;

const STATIC_CONTEXTS = new Map<string, Record<string, unknown>>([
  ...credentialsContexts,
  ...dataIntegrityContexts,
  ...multikeyContexts,
  ...statusListContexts,
  ...didContext.contexts,
  ...obContexts,
]);

export interface LoadedDocument {
  contextUrl: null;
  documentUrl: string;
  document: Record<string, unknown>;
}

export type DocumentLoader = (url: string) => Promise<LoadedDocument>;

const MULTIKEY_CONTEXT_V1_URL = 'https://w3id.org/security/multikey/v1';

/**
 * Build a document loader over an explicit, closed set of documents.
 *
 * Resolves: vendored JSON-LD contexts, the supplied DID documents (by DID,
 * plus each listed verification method by its fragment id, dereferenced to
 * the individual key document as DataIntegrityProof expects), and the
 * supplied extra documents (e.g. status list credentials) by exact id.
 * Anything else throws — this loader performs NO network access, ever.
 * A key id absent from every DID document therefore fails verification,
 * which is exactly what key retirement means.
 */
export function createOfflineDocumentLoader(options: {
  didDocuments?: DidDocument[];
  extraDocuments?: Record<string, unknown>[];
} = {}): DocumentLoader {
  const docs = new Map<string, Record<string, unknown>>();
  for (const didDoc of options.didDocuments ?? []) {
    docs.set(didDoc.id, didDoc as unknown as Record<string, unknown>);
    for (const vm of didDoc.verificationMethod) {
      docs.set(vm.id, {'@context': MULTIKEY_CONTEXT_V1_URL, ...vm});
    }
  }
  for (const doc of options.extraDocuments ?? []) {
    const id = doc['id'];
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('extraDocuments entries must have a string "id"');
    }
    docs.set(id, doc);
  }
  return async (url: string): Promise<LoadedDocument> => {
    const context = STATIC_CONTEXTS.get(url);
    if (context) {
      return {contextUrl: null, documentUrl: url, document: context};
    }
    const document = docs.get(url);
    if (document) {
      return {contextUrl: null, documentUrl: url, document};
    }
    throw new Error(
      `Refusing to load "${url}": not in the static context store or the ` +
      'supplied document set. This loader never touches the network.');
  };
}

/** Build the offline loader for everything a bundle carries. */
export function bundleDocumentLoader(bundle: CredentialBundle): DocumentLoader {
  return createOfflineDocumentLoader({
    didDocuments: bundle.didDocuments,
    extraDocuments: bundle.statusListCredentials as SignedCredential[],
  });
}
