# headlamp-extraction

Document-extraction **prototype** for Headlamp SkillBridge credentialing.
Plain text in, structured field candidates out. Pure TypeScript, zero
runtime dependencies, no database, no HTTP, no PDF handling.

> **This is a parsing utility, not part of the audited signing code.**
> The credential/crypto core lives in the repository root (`src/`) and is
> untouched by this package. Nothing here handles keys, credentials, or
> proofs, and nothing in the core imports from here. Treat this package's
> output as *candidates for human/platform review*, never as verified
> facts.

The platform owns the surrounding pipeline: PDF→text conversion upstream,
and taxonomy mapping + human review downstream. This module only does
**text → candidates**.

## Layout

```
extraction/
  src/            parsers (trainingPlan, offerLetter, dates, text utils)
  test/           vitest suite
  test/fixtures/  synthetic input documents — NO REAL DOCUMENTS, ever
  test/golden/    committed golden outputs (the spec)
```

This is a self-contained subpackage with its own `package.json`,
lockfile, tsconfig, eslint config, and test suite, mirroring the root
toolchain:

```sh
cd extraction
npm ci
npm run typecheck:all   # tsc over src + test, no emit
npm run lint            # eslint src test
npm test                # vitest (golden files committed)
npm run golden:update   # regenerate goldens after an intentional change — review the diff
```

CI runs this package on every push alongside the core: the `extraction`
job in `.github/workflows/ci.yml` executes the same
`typecheck:all` / `lint` / `test` gates on the same Node matrix as the
root package.

## API surface

```ts
import {parseTrainingPlan, parseOfferLetter, toIso} from 'headlamp-extraction';

parseTrainingPlan(text: string): TrainingPlanResult
// {format: 'course',    confidence, fields: CourseFields}
// {format: 'placement', confidence, fields: PlacementFields}
// {format: 'unknown',   confidence: 0, fields: {}}

parseOfferLetter(text: string): OfferLetterResult
// {letterDate?, host?, address?, startDate?, endDate?, roleTitle?,
//  supervisor?: {name, title}, dutiesRaw: string[],
//  employmentIntent: boolean, signatureEvidence: boolean, confidence}

toIso(raw: string): string | undefined  // conservative date normalization
```

- **Skill candidates** (`fields.skillCandidates`) are raw labels with a
  `sourceSection` (`curriculum_day` | `skills_list` | `responsibilities`)
  and a surrounding context snippet. No taxonomy mapping, deduplication,
  or normalization happens here — raw candidates only.
- **Dates** are `{raw, iso?}`. `iso` appears only when the text is
  unambiguous (explicit year, provable day/month order). "14 Oct" and
  "04/05/2025" keep only `raw` — the parser never invents a year or
  assumes MM/DD.
- **Confidence** is a deterministic per-field presence score in [0, 1].
  Each expected anchor/field carries a fixed weight; missing or malformed
  anchors subtract honestly. There is no fuzzy scoring.

## Abstain-over-guess discipline

A parser that guesses is worse than one that abstains. Concretely:

- A document that doesn't clear a format's anchor threshold — or that
  matches both formats equally — is `{format: 'unknown', confidence: 0,
  fields: {}}` and routes to human review platform-side.
- An anchor that is present but malformed yields **no field** and a lower
  confidence. Example: an `Instructor Qualification:` line naming "the
  site operations team" instead of a person produces no `supervisor`
  (the name pattern requires capitalized name tokens) rather than a
  garbage name/title split.
- Week numbers are reported exactly as printed. Real plans skip weeks
  (Week 12 → Week 15); the parser never assumes or repairs a sequence.
- The offer letter's employment-intent sentence is captured as a boolean;
  its *absence* is a legitimate variant and does not reduce confidence.
  Missing signature-trail markers (`Doc ID:` / `Signed by`) do.

## Per-format anchor strategy

**Format A — course-style (e.g. Vets RISE).** Detection: labeled header
lines (`Course Participant:`, `Training Outline Title:`) plus
`Week N (…):` headings, `Objective:` lines, and `Day N:` bullets, scored
and thresholded. Parsing: header block by label; each `Week N (dates):
Title (NN hours)` heading opens a section that collects one `Objective:`
line and `Day N:` bullets. Holiday lines, guest-speaker footnotes, and
other stray copy land in per-week `notes`. Skill candidates come from
splitting day bullets on `;` (comma is intentionally *not* a splitter —
"Boards, lists, and cards" is one label).

**Format B — placement-style.** Detection: `Instructor Qualification:`,
the "Mentorship and instruction will be provided by …" sentence,
`Job Title:` / `Job Description:` labels, and a weekly-hours phrase.
Parsing: participant/host from the prose header ("fellowship of [Name]
with/at/hosted by [Host]"), fellowship dates from a "from X to Y" chunk
that must contain digits, supervisor from the provided-by sentence
(`[Name], [Title] at [Host]` — name must be 1–5 capitalized tokens),
bullets under `Responsibilities:` and `Skills…:` headings, and weekly
hours from "NN hours per week". Skills-list bullets → `skills_list`
candidates; responsibility bullets → `responsibilities` candidates.

**Offer letter.** Every field hangs off a template anchor phrase:
"offer of a Headlamp Fellowship", "beginning [date] and ending
approximately [date] with duty at [Host].", "They are located at
[address].", "Your initial direct supervisor will be [Name], [Title] at
[Host].", "Your role will be a/an [Role].", the `Duties &
Responsibilities:` bullet list, "intends to extend their own offer"
(→ `employmentIntent`), and `Doc ID:` / `Signed by`
(→ `signatureEvidence`). The letter date is the first standalone,
fully-specified date near the top.

## What would break it (honest fragility list)

- **Reworded anchors.** These are template parsers, not NLP. "ending
  around" instead of "ending approximately", "reports to" instead of
  "Your initial direct supervisor will be", a `Duties:` heading without
  "Responsibilities" — each silently drops that field (confidence drops
  with it, which is the designed failure mode, but the data is gone).
- **Sentence-internal periods.** Host names like "Acme Inc." or addresses
  like "1 St. Charles Pl." end the non-greedy sentence captures early —
  "Acme Inc" survives but "St. Charles" truncates the address at "St".
- **Supervisor names that don't look like names.** Lowercase particles
  ("dana van der Berg") fail the capitalized-token name pattern and the
  parser abstains — correct behavior for garbage, a miss for real names
  with particles.
- **Multi-column or table-based PDF→text output.** The parsers assume
  reading-order text with line structure roughly preserved. Interleaved
  columns, or a header block emitted as a two-column table, will shred
  the labeled-line anchors.
- **Semicolon-free day bullets.** A curriculum day written as one long
  comma-separated sentence becomes a single over-long skill candidate
  instead of several.
- **Two documents concatenated** (e.g. offer letter + plan in one text
  blob) — first-match-wins regexes will bind to whichever instance comes
  first; there is no segmentation step.
- **Ambiguity resolution is crude.** Format detection is a threshold on
  hand-weighted anchor scores. A hybrid document that mixes both
  families' anchors lands on whichever score is higher (or `unknown` on a
  tie) with no diagnostic output about *why*.

## What the platform integration needs

- **PDF→text quality.** Reading-order extraction with line breaks
  preserved (labeled header lines must stay on their own lines); curly
  quotes/en-dashes/NBSP are normalized here, but hyphenation repair,
  column ordering, and header/footer stripping are upstream concerns.
  OCR'd scans need enough fidelity that anchor phrases survive verbatim —
  a single OCR error inside "Instructor Qualification:" drops the anchor.
- **Routing.** Callers should branch on `format`/`confidence`:
  `unknown` or low-confidence results go to human review, never into
  credential issuance. Suggested starting gate: auto-accept ≥ 0.9 for
  field prefill (still human-confirmed), review queue below that. Tune
  against the ~80 real documents platform-side.
- **Taxonomy mapping.** `skillCandidates` are raw strings by design.
  Deduplication, canonicalization ("MS Power BI" → Power BI), and mapping
  to the platform taxonomy happen downstream, where the taxonomy lives.
- **Dates.** Year-less ranges ("14 Oct – 8 Jan") arrive as `raw` only.
  The platform knows the cohort year and must resolve them — including
  the year rollover on ranges that cross a boundary.
- **PII.** Real documents are PII-heavy: parse them platform-side and
  never round-trip their text or parsed output into this repository (see
  `test/fixtures/README.md`).
