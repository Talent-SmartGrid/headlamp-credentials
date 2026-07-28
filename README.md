# headlamp-credentials

Open Badges 3.0 issuing and verification library for the **Headlamp
SkillBridge Credential**. Pure TypeScript: pure functions in, signed JSON
out — no database, no HTTP server, no framework.

- **Signing/verification core:** `@digitalbazaar/vc` + `DataIntegrityProof`
  (`eddsa-rdfc-2022`: Ed25519 over RDFC-1.0 deterministic JSON-LD
  canonicalization). Audited primitives are adopted, never hand-rolled.
- **Issuer identity:** `did:web:myheadlamp.com` with multi-key DID
  documents (key rotation supported from day one).
- **Evidence discipline:** assertion text is a pure function of the
  evidence basis (`documents` | `attestation` | `both`); completion
  language is unreachable without a supervisor attestation *at the type
  level*.
- **Endorsements:** `work_confirmed` / `would_hire` / `was_hired` as
  separate signed OBv3 EndorsementCredentials.
- **Revocation:** W3C Bitstring Status List (builder + checker).
- **Offline bundles:** single-file format (credential + chosen endorsements
  + DID/status snapshots) that verifies with **zero network access**.
- **Display control:** an excluded endorsement is absent — byte-for-byte
  indistinguishable from never having existed. No hidden flags anywhere.

## Install (from this repo)

```sh
npm install github:Talent-SmartGrid/headlamp-credentials
```

## Verify any artifact from a terminal

```sh
npx headlamp-credentials verify bundle.json
```

## Documentation

- [docs/API.md](docs/API.md) — full usage guide for the platform team.
- [conformance/README.md](conformance/README.md) — OBv3 conformance: what
  was validated automatically, and how to run the committed samples through
  the 1EdTech public validator.

## Development

```sh
npm ci
npm test            # builds + runs the vitest suite (golden files committed)
npm run typecheck:all
npm run lint
```

**Key discipline (non-negotiable):** this repository never contains a
production private key. The only committed keys are test fixtures under
`test/fixtures/` marked `TEST KEY — NEVER USE IN PRODUCTION`. The library
accepts key material by injection only (`importKey`); production keys live
in the platform's secret store.
