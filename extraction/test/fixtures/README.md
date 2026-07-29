# Fixtures — NO REAL DOCUMENTS

**Every file in this directory is synthetic.** All names, companies,
addresses, dates, document IDs, and program details are invented. They
mimic the *structure* of the two in-house training-plan template families
and the Headlamp offer-letter template — nothing else.

**PII is prohibited here.** Real participant documents are PII-heavy and
must NEVER enter this repository, in any form: no real names, no real
hosts, no redacted excerpts, no "just the header". If a new edge case is
discovered in a real document, reproduce the *structural quirk* with
invented content and add it as a new synthetic fixture.

Layout:

- `training-plans/` — Format A ("course-style"), Format B
  ("placement-style"), and not-a-training-plan documents that must parse
  as `unknown`.
- `offer-letters/` — Headlamp offer-letter template variants.

Golden outputs live in `../golden/` under the same relative names. After
an intentional parser change, regenerate with `npm run golden:update` and
review the diff — goldens are the spec, not a snapshot dump.
