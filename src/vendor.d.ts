/**
 * Minimal ambient typings for the Digital Bazaar stack, which ships without
 * TypeScript declarations. We type only the surface this library touches.
 */

declare module '@digitalbazaar/ed25519-multikey' {
  export interface Ed25519Signer {
    id: string;
    algorithm: string;
    sign(options: { data: Uint8Array }): Promise<Uint8Array>;
  }
  export interface Ed25519Verifier {
    id: string;
    algorithm: string;
    verify(options: { data: Uint8Array; signature: Uint8Array }): Promise<boolean>;
  }
  export interface Ed25519Multikey {
    id?: string;
    controller?: string;
    type: 'Multikey';
    publicKeyMultibase: string;
    secretKeyMultibase?: string;
    signer(): Ed25519Signer;
    verifier(): Ed25519Verifier;
    export(options: {
      publicKey?: boolean;
      secretKey?: boolean;
      includeContext?: boolean;
    }): Promise<Record<string, unknown>>;
  }
  export function generate(options?: {
    id?: string;
    controller?: string;
    seed?: Uint8Array;
  }): Promise<Ed25519Multikey>;
  export function from(key: Record<string, unknown>): Promise<Ed25519Multikey>;
}

declare module '@digitalbazaar/data-integrity' {
  export class DataIntegrityProof {
    constructor(options: {
      signer?: unknown;
      cryptosuite: unknown;
      date?: string | Date | null;
    });
  }
}

declare module '@digitalbazaar/eddsa-rdfc-2022-cryptosuite' {
  export const cryptosuite: unknown;
}

declare module '@digitalbazaar/vc' {
  export interface VerifyResult {
    verified: boolean;
    error?: Error & { errors?: Error[] };
    results?: unknown[];
    statusResult?: { verified: boolean; error?: Error; results?: unknown[] };
  }
  export function issue(options: {
    credential: Record<string, unknown>;
    suite: unknown;
    documentLoader: unknown;
    now?: string | Date;
  }): Promise<Record<string, unknown>>;
  export function verifyCredential(options: {
    credential: Record<string, unknown>;
    suite: unknown;
    documentLoader: unknown;
    checkStatus?: unknown;
    now?: string | Date;
  }): Promise<VerifyResult>;
}

declare module '@digitalbazaar/vc-bitstring-status-list' {
  export interface BitstringStatusList {
    length: number;
    setStatus(index: number, status: boolean): void;
    getStatus(index: number): boolean;
    encode(): Promise<string>;
  }
  export function createList(options: { length: number }): Promise<BitstringStatusList>;
  export function decodeList(options: { encodedList: string }): Promise<BitstringStatusList>;
  export function createCredential(options: {
    id: string;
    list: BitstringStatusList;
    statusPurpose: string;
    context?: string[];
  }): Promise<Record<string, unknown>>;
  export function checkStatus(options: {
    credential: Record<string, unknown>;
    documentLoader: unknown;
    suite: unknown;
    verifyBitstringStatusListCredential?: boolean;
    verifyMatchingIssuers?: boolean;
  }): Promise<{
    verified: boolean;
    error?: Error;
    results?: { verified: boolean; status: boolean; credentialStatus: unknown }[];
  }>;
}

declare module '@digitalbazaar/credentials-context' {
  export const contexts: Map<string, Record<string, unknown>>;
  export const named: Map<string, { id: string; context: Record<string, unknown> }>;
}

declare module '@digitalbazaar/data-integrity-context' {
  export const contexts: Map<string, Record<string, unknown>>;
  export const CONTEXT_URL: string;
}

declare module '@digitalbazaar/multikey-context' {
  export const contexts: Map<string, Record<string, unknown>>;
  export const CONTEXT_URL: string;
}

declare module '@digitalbazaar/vc-bitstring-status-list-context' {
  export const contexts: Map<string, Record<string, unknown>>;
  export const CONTEXT_URL: string;
}

declare module 'did-context' {
  const didContext: {
    contexts: Map<string, Record<string, unknown>>;
    constants: { DID_CONTEXT_URL: string };
  };
  export = didContext;
}

declare module '@digitalcredentials/open-badges-context' {
  export const contexts: Map<string, Record<string, unknown>>;
  export const CONTEXT_URL_V3: string;
  export const CONTEXT_URL_V3_0_3: string;
}
