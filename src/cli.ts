/**
 * `headlamp-credentials verify <bundle.json>` — offline bundle verification
 * from a terminal. Exit code 0 = verified, 1 = not verified, 2 = usage/IO.
 */
import {readFile} from 'node:fs/promises';

import {verifyBundle} from './bundle.js';
import type {BundleVerificationResult, CredentialCheck} from './types.js';

const USAGE = `Usage: headlamp-credentials verify <bundle.json> [--json]

Verifies a Headlamp credential bundle entirely offline (no network access):
signature, validity window, revocation snapshot, and every included
endorsement. Prints a report; exits 0 if fully verified, 1 otherwise.`;

function mark(ok: boolean): string {
  return ok ? 'PASS' : 'FAIL';
}

function describeCheck(label: string, check: CredentialCheck): string[] {
  const lines = [
    `${label}: ${check.id ?? '(no id)'}`,
    `  signature:  ${mark(check.signatureVerified)}`,
    `  validity:   ${mark(check.withinValidity)}`,
    `  revocation: ${
      check.notRevoked === 'no-status'
        ? 'no status entry (not checked)'
        : check.notRevoked
          ? 'PASS (not revoked)'
          : 'FAIL (revoked or status check failed)'
    }`,
  ];
  for (const error of check.errors) lines.push(`  ! ${error}`);
  return lines;
}

function report(result: BundleVerificationResult): string {
  const lines = describeCheck('Credential', result.credential);
  if (result.endorsements.length === 0) {
    lines.push('Endorsements: none included');
  }
  result.endorsements.forEach((endorsement, i) => {
    lines.push(...describeCheck(
      `Endorsement ${i + 1}${endorsement.kind ? ` (${endorsement.kind})` : ''}`,
      endorsement));
    lines.push(`  references credential: ${mark(endorsement.referencesCredential)}`);
  });
  for (const error of result.errors) lines.push(`! ${error}`);
  lines.push('');
  lines.push(result.verified ? 'RESULT: VERIFIED' : 'RESULT: NOT VERIFIED');
  return lines.join('\n');
}

export async function main(argv: string[]): Promise<number> {
  const args = argv.filter(a => a !== '--json');
  const json = argv.includes('--json');
  const [command, file] = args;
  if (command !== 'verify' || !file) {
    console.error(USAGE);
    return 2;
  }
  let bundle: unknown;
  try {
    bundle = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    console.error(`Could not read bundle: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  const result = await verifyBundle(bundle);
  console.log(json ? JSON.stringify(result, null, 2) : report(result));
  return result.verified ? 0 : 1;
}
