/**
 * Shared test fixtures. Everything is FIXED so signatures (Ed25519 is
 * deterministic) and therefore whole signed documents are reproducible
 * byte-for-byte — which is what makes golden-file tests possible.
 */
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect} from 'vitest';

import {
  buildDidWebDocument,
  importKey,
  type DidDocument,
  type EvidenceBasis,
  type IssuerProfile,
  type KeyMaterial,
  type PlacementDetails,
  type SigningKey,
  type SupervisorAttestation,
} from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

interface FixtureKeys {
  WARNING: string;
  issuerKey1: Required<KeyMaterial>;
  issuerKey2: Required<KeyMaterial>;
  endorserKey: Required<KeyMaterial>;
}

export const fixtureKeys: FixtureKeys =
  JSON.parse(readFileSync(join(HERE, 'fixtures', 'test-keys.json'), 'utf8'));

export const ISSUER: IssuerProfile = {
  id: 'did:web:myheadlamp.com',
  name: 'Headlamp',
  url: 'https://myheadlamp.com',
};

export const ENDORSER: IssuerProfile = {
  id: 'did:web:coolsys.example',
  name: 'CoolSys Inc.',
};

export const FIXED = {
  validFrom: '2026-05-01T00:00:00Z',
  validUntil: '2031-05-01T00:00:00Z',
  proofDate: '2026-05-01T00:00:00Z',
  now: new Date('2026-06-01T00:00:00Z'),
  credentialId: 'urn:uuid:c0ffee00-0000-4000-8000-000000000001',
  endorsementId: 'urn:uuid:c0ffee00-0000-4000-8000-000000000002',
  subjectId: 'urn:headlamp:candidate:e9b1a2f4',
  statusListUrl: 'https://myheadlamp.com/status/skillbridge/1',
} as const;

export const PLACEMENT: PlacementDetails = {
  hostOrganization: 'CoolSys Inc.',
  startDate: '2026-01-06',
  endDate: '2026-04-25',
};

export const ATTESTATION: SupervisorAttestation = {
  supervisorName: 'Dana Whitfield',
  supervisorTitle: 'Field Operations Manager',
};

export const EVIDENCE: Record<'documents' | 'attestation' | 'both', EvidenceBasis> = {
  documents: {basis: 'documents', placement: PLACEMENT},
  attestation: {basis: 'attestation', placement: PLACEMENT, attestation: ATTESTATION},
  both: {basis: 'both', placement: PLACEMENT, attestation: ATTESTATION},
};

export async function issuerKey1(): Promise<SigningKey> {
  return importKey(fixtureKeys.issuerKey1);
}
export async function issuerKey2(): Promise<SigningKey> {
  return importKey(fixtureKeys.issuerKey2);
}
export async function endorserKey(): Promise<SigningKey> {
  return importKey(fixtureKeys.endorserKey);
}

/** Issuer DID document listing BOTH keys (key rotation from day one). */
export function issuerDidDocument(): DidDocument {
  return buildDidWebDocument({
    domain: 'myheadlamp.com',
    publicKeys: [
      {fragment: 'key-1', publicKeyMultibase: fixtureKeys.issuerKey1.publicKeyMultibase},
      {fragment: 'key-2', publicKeyMultibase: fixtureKeys.issuerKey2.publicKeyMultibase},
    ],
  });
}

export function endorserDidDocument(): DidDocument {
  return buildDidWebDocument({
    domain: 'coolsys.example',
    publicKeys: [
      {fragment: 'key-1', publicKeyMultibase: fixtureKeys.endorserKey.publicKeyMultibase},
    ],
  });
}

/**
 * Compare `actual` against a committed golden file. Run tests with
 * UPDATE_GOLDEN=1 to (re)write goldens; review the diff before committing.
 */
export function expectGolden(name: string, actual: string): void {
  const path = join(HERE, 'golden', name);
  if (process.env['UPDATE_GOLDEN'] === '1' || !existsSync(path)) {
    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(path, actual);
  }
  const expected = readFileSync(path, 'utf8');
  expect(actual, `golden file mismatch: test/golden/${name}`).toBe(expected);
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}
