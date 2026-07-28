/**
 * OBv3 conformance checks, written from the normative requirements of the
 * Open Badges Specification v3.0.3 (AchievementCredential / Endorsement-
 * Credential data models) and the VC Data Model 2.0.
 *
 * The 1EdTech public validator could not be run inside this repo's build
 * environment (its hosts are unreachable from the sandbox); see
 * conformance/README.md for exact manual validation steps against the
 * hosted validator using the committed sample artifacts.
 */
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {OB_V3_CONTEXT_URL, VC_V2_CONTEXT_URL} from '../src/index.js';

const GOLDEN = join(import.meta.dirname, 'golden');

function golden(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(GOLDEN, name), 'utf8'));
}

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function checkProof(credential: Record<string, unknown>) {
  const proof = credential['proof'] as Record<string, unknown>;
  expect(proof['type']).toBe('DataIntegrityProof');
  expect(proof['cryptosuite']).toBe('eddsa-rdfc-2022');
  expect(proof['proofPurpose']).toBe('assertionMethod');
  expect(typeof proof['verificationMethod']).toBe('string');
  expect(proof['proofValue']).toMatch(/^z/);
}

function checkVcCore(credential: Record<string, unknown>) {
  const context = credential['@context'] as string[];
  expect(context[0]).toBe(VC_V2_CONTEXT_URL);
  expect(context).toContain(OB_V3_CONTEXT_URL);
  const type = credential['type'] as string[];
  expect(type).toContain('VerifiableCredential');
  expect(typeof credential['id']).toBe('string');
  const issuer = credential['issuer'] as Record<string, unknown>;
  expect(typeof issuer['id']).toBe('string');
  expect(credential['validFrom']).toMatch(DATETIME_RE);
  checkProof(credential);
}

describe('OBv3 conformance: AchievementCredential', () => {
  const files = ['credential-documents.json', 'credential-attestation.json', 'credential-both.json'];

  for (const file of files) {
    describe(file, () => {
      const credential = golden(file);

      it('satisfies VC 2.0 core requirements', () => checkVcCore(credential));

      it('is typed AchievementCredential with a complete Achievement', () => {
        expect(credential['type']).toEqual(['VerifiableCredential', 'AchievementCredential']);
        const subject = credential['credentialSubject'] as Record<string, unknown>;
        expect(subject['type']).toEqual(['AchievementSubject']);
        expect(typeof subject['id']).toBe('string');
        const achievement = subject['achievement'] as Record<string, unknown>;
        expect(achievement['type']).toEqual(['Achievement']);
        for (const required of ['id', 'name', 'description']) {
          expect(typeof achievement[required], `achievement.${required}`).toBe('string');
        }
        const criteria = achievement['criteria'] as Record<string, unknown>;
        expect(typeof criteria['narrative']).toBe('string');
      });

      it('carries evidence with a narrative', () => {
        const evidence = credential['evidence'] as Record<string, unknown>[];
        expect(evidence).toHaveLength(1);
        expect(evidence[0]!['type']).toEqual(['Evidence']);
        expect(typeof evidence[0]!['narrative']).toBe('string');
      });

      it('status entry, when present, is a valid BitstringStatusListEntry', () => {
        const status = credential['credentialStatus'] as Record<string, unknown> | undefined;
        if (!status) return;
        expect(status['type']).toBe('BitstringStatusListEntry');
        expect(status['statusPurpose']).toBe('revocation');
        expect(String(Number(status['statusListIndex']))).toBe(status['statusListIndex']);
        expect(typeof status['statusListCredential']).toBe('string');
        expect(status['id']).not.toBe(status['statusListCredential']);
      });
    });
  }

  it('evidence narratives across the three states follow the three patterns exactly', () => {
    const narrative = (file: string) =>
      ((golden(file)['evidence'] as Record<string, unknown>[])[0]!)['narrative'] as string;
    const documents = narrative('credential-documents.json');
    const attestation = narrative('credential-attestation.json');
    const both = narrative('credential-both.json');
    expect(documents).toMatch(/^Placed in a DoD SkillBridge at .+, .+\. Offer letter and training plan verified by Headlamp\.$/);
    expect(documents).not.toContain('Completed');
    expect(attestation).toMatch(/^Completed a DoD SkillBridge at .+, .+\. Confirmed by .+, .+\.$/);
    expect(both).toBe(`${documents} ${attestation}`);
  });
});

describe('OBv3 conformance: EndorsementCredential', () => {
  const files = readdirSync(GOLDEN).filter(f => f.startsWith('endorsement-'));

  it('covers all three endorsement kinds', () => {
    expect(files.sort()).toEqual([
      'endorsement-was_hired.json',
      'endorsement-work_confirmed.json',
      'endorsement-would_hire.json',
    ]);
  });

  for (const file of files) {
    it(`${file} satisfies VC core + EndorsementSubject requirements`, () => {
      const credential = golden(file);
      checkVcCore(credential);
      expect(credential['type']).toEqual(['VerifiableCredential', 'EndorsementCredential']);
      const subject = credential['credentialSubject'] as Record<string, unknown>;
      expect(subject['type']).toEqual(['EndorsementSubject']);
      expect(typeof subject['id']).toBe('string');
      expect(typeof subject['endorsementComment']).toBe('string');
    });
  }
});
