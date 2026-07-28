import {execFile} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {describe, expect, it} from 'vitest';

const execFileAsync = promisify(execFile);

describe('verify CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headlamp-cli-'));

  async function runCli(...args: string[]) {
    try {
      const {stdout, stderr} = await execFileAsync(
        process.execPath,
        ['bin/headlamp-credentials.js', ...args],
        {cwd: join(import.meta.dirname, '..')},
      );
      return {code: 0, stdout, stderr};
    } catch (e) {
      const err = e as {code?: number; stdout?: string; stderr?: string};
      return {code: err.code ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? ''};
    }
  }

  it('verifies the committed golden bundle and exits 0', async () => {
    const {code, stdout} = await runCli('verify', 'test/golden/bundle-full.json');
    expect(stdout).toContain('RESULT: VERIFIED');
    expect(stdout).toContain('signature:  PASS');
    expect(code).toBe(0);
  }, 30000);

  it('exits 1 for a tampered bundle', async () => {
    const {readFileSync} = await import('node:fs');
    const bundle = JSON.parse(
      readFileSync(join(import.meta.dirname, 'golden', 'bundle-full.json'), 'utf8'));
    bundle.credential.evidence[0].narrative = 'Completed everything, honest.';
    const file = join(dir, 'tampered.json');
    writeFileSync(file, JSON.stringify(bundle));
    const {code, stdout} = await runCli('verify', file);
    expect(code).toBe(1);
    expect(stdout).toContain('RESULT: NOT VERIFIED');
  }, 30000);

  it('exits 2 with usage on bad invocation', async () => {
    const {code, stderr} = await runCli('frobnicate');
    expect(code).toBe(2);
    expect(stderr).toContain('Usage:');
  });

  it('exits 2 for a missing file', async () => {
    const {code} = await runCli('verify', join(dir, 'does-not-exist.json'));
    expect(code).toBe(2);
  });

  it('--json emits machine-readable output', async () => {
    const {code, stdout} = await runCli('verify', 'test/golden/bundle-full.json', '--json');
    const parsed = JSON.parse(stdout);
    expect(parsed.verified).toBe(true);
    expect(code).toBe(0);
  }, 30000);
});
