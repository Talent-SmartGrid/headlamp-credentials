import {mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect} from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
export const fixturesDir = join(testDir, 'fixtures');
export const goldenDir = join(testDir, 'golden');

const UPDATE = process.env.UPDATE_GOLDEN === '1';

export function fixtureNames(subdir: string): string[] {
  return readdirSync(join(fixturesDir, subdir))
    .filter((f) => f.endsWith('.txt'))
    .sort();
}

export function readFixture(subdir: string, name: string): string {
  return readFileSync(join(fixturesDir, subdir, name), 'utf8');
}

/**
 * Compare `actual` against the committed golden file, or rewrite the golden
 * when UPDATE_GOLDEN=1 (`npm run golden:update`). Goldens are reviewed by a
 * human after regeneration — they are the spec, not a snapshot dump.
 */
export function checkGolden(subdir: string, fixtureName: string, actual: unknown): void {
  const goldenPath = join(goldenDir, subdir, fixtureName.replace(/\.txt$/, '.json'));
  const serialized = JSON.stringify(actual, null, 2) + '\n';
  if (UPDATE) {
    mkdirSync(dirname(goldenPath), {recursive: true});
    writeFileSync(goldenPath, serialized);
    return;
  }
  expect(existsSync(goldenPath), `missing golden file: ${goldenPath}`).toBe(true);
  expect(JSON.parse(serialized)).toEqual(JSON.parse(readFileSync(goldenPath, 'utf8')));
}

/** Every golden file must correspond to a fixture — no orphans. */
export function goldenNames(subdir: string): string[] {
  const dir = join(goldenDir, subdir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
}
