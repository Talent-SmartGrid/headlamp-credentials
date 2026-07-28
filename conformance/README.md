# OBv3 conformance

This directory contains sample artifacts produced by this library, committed
for validation against the 1EdTech Open Badges 3.0 tooling.

## What was checked, and how

**1. Automated structural conformance (runs in CI).**
`test/conformance.test.ts` validates every sample in this directory against
the normative requirements of the Open Badges Specification v3.0.3
(AchievementCredential, EndorsementCredential) and the W3C VC Data Model 2.0:

- `@context` starts with `https://www.w3.org/ns/credentials/v2` and includes
  the OB 3.0.3 context (`…/spec/ob/v3p0/context-3.0.3.json`);
- `type`, `issuer`, `validFrom`, `credentialSubject` / `AchievementSubject` /
  `Achievement` (`name`, `description`, `criteria`), `EndorsementSubject`
  (`id`, `endorsementComment`) required-property rules;
- `credentialStatus` is a well-formed `BitstringStatusListEntry`
  (purpose `revocation`, integer index, distinct list URL);
- `proof` is a `DataIntegrityProof` with cryptosuite `eddsa-rdfc-2022`,
  purpose `assertionMethod`, and a multibase `proofValue`.

The JSON-LD layer itself provides a second check: signing canonicalizes with
RDFC-1.0 in **safe mode**, so any term not defined by the VC 2.0 / OB 3.0.3
contexts would fail issuance outright. Nothing in these samples is outside
the OBv3 vocabulary.

**2. 1EdTech public validator — why it was not run here.**
This repository was built in a network-restricted environment: all
`*.imsglobal.org` hosts (including `purl.imsglobal.org`, which serves the
official JSON schemas) and the `1EdTech/digital-credentials-public-validator`
repository were unreachable, so the validator could not be cloned/built and
the official JSON schemas could not be vendored. The OB 3.0.3 JSON-LD
context used for signing IS the official one, obtained via the
`@digitalcredentials/open-badges-context` npm package (Digital Credentials
Consortium, MIT).

## Manually validating these samples (do this from an unrestricted machine)

Option A — hosted validator:
1. Go to the 1EdTech certification validator at
   <https://validator.imsglobal.org/> (Open Badges 3.0 section).
2. Paste the contents of `samples/credential-documents.json`,
   `credential-attestation.json`, `credential-both.json`, and each
   `endorsement-*.json` as OB 3.0 verifiable credentials in JSON format.

Option B — local validator:
```sh
git clone https://github.com/1EdTech/digital-credentials-public-validator
cd digital-credentials-public-validator
mvn spring-boot:run   # then POST the sample payloads per its README
```

**Expected result:** context, schema, and data-model checks pass. Proof
*verification* by the validator will fail until Headlamp publishes the DID
document at `https://myheadlamp.com/.well-known/did.json` — the samples are
signed by `did:web:myheadlamp.com#key-1` using the committed **test** keys
(`test/fixtures/test-keys.json`, never for production), and the validator
resolves `did:web` over the live network. To check the signatures instead,
use the offline bundle, which carries its own DID-document snapshot:

```sh
npx headlamp-credentials verify conformance/samples/bundle-full.json
```
