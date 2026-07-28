# headlamp-credentials — API guide

Open Badges 3.0 issuing and verification for the Headlamp SkillBridge
Credential. Pure functions in, signed JSON out: no database, no HTTP server,
no framework. This guide is written for the platform team consuming the
package.

## Install

```sh
npm install github:Talent-SmartGrid/headlamp-credentials
```

The package builds itself on install (`prepare` script) and exposes:

```ts
import {/* … */} from 'headlamp-credentials';
```

## The rules the API enforces

1. **Keys are injected, never loaded.** Every signing function takes a
   `SigningKey` produced by `importKey(material)`. Key material lives in the
   platform's secret store; this library has no notion of key files, env
   vars, or config. The only keys in this repo are test keys under
   `test/fixtures/` marked `TEST KEY — NEVER USE IN PRODUCTION`.
2. **Completion language requires an attestation — by type.** The
   `EvidenceBasis` union has no variant that yields "Completed …" wording
   without a `SupervisorAttestation` object. `{basis: 'attestation'}` or
   `{basis: 'both'}` without one is a compile error.
3. **Exclusion is absence.** Bundle/payload builders include exactly the
   endorsements you pass. There is no hidden flag in any output format; an
   excluded endorsement is byte-for-byte indistinguishable from one never
   issued (verified by test).

## Cryptography

Signing and verification are delegated to the audited Digital Bazaar stack:
`@digitalbazaar/vc` (VC 2.0), `DataIntegrityProof` with the
`eddsa-rdfc-2022` cryptosuite (Ed25519 over deterministic RDFC-1.0 JSON-LD
canonicalization), `@digitalbazaar/ed25519-multikey`, and
`@digitalbazaar/vc-bitstring-status-list` for revocation. This library only
assembles OBv3 documents around those primitives.

All JSON-LD contexts are vendored via npm packages and served from memory —
issuing and verifying never fetch a context from the network.

---

## 0. One-time setup: keys and the DID document

```ts
import {generateKeyPair, buildDidWebDocument, didWebDocumentUrl} from 'headlamp-credentials';

// Provision a key (run once, store `material` in the secret store, then
// discard — do NOT write it to disk or commit it):
const {material} = await generateKeyPair({
  id: 'did:web:myheadlamp.com#key-1',
  controller: 'did:web:myheadlamp.com',
});

// Generate the DID document to serve at the well-known path. List every
// currently-valid key — key rotation means adding #key-2 here while #key-1
// credentials keep verifying:
const didDocument = buildDidWebDocument({
  domain: 'myheadlamp.com',
  publicKeys: [
    {fragment: 'key-1', publicKeyMultibase: material.publicKeyMultibase},
    // {fragment: 'key-2', publicKeyMultibase: nextKey.publicKeyMultibase},
  ],
});

didWebDocumentUrl('did:web:myheadlamp.com');
// => 'https://myheadlamp.com/.well-known/did.json'  ← serve didDocument here
```

At request time, load the stored material and import it:

```ts
import {importKey} from 'headlamp-credentials';
const key = await importKey(await secretStore.get('issuer-key-1')); // KeyMaterial JSON
```

## 1. Issue the base credential — one call per evidence state

```ts
import {buildAchievementCredential, signCredential} from 'headlamp-credentials';
import {randomUUID} from 'node:crypto';

const issuer = {id: 'did:web:myheadlamp.com', name: 'Headlamp', url: 'https://myheadlamp.com'};
const placement = {
  hostOrganization: 'CoolSys Inc.',
  startDate: '2026-01-06',
  endDate: '2026-04-25',
};

// State 1: documents only → asserts PLACEMENT.
// "Placed in a DoD SkillBridge at CoolSys Inc., January 6 – April 25, 2026.
//  Offer letter and training plan verified by Headlamp."
const documentsOnly = buildAchievementCredential({
  credentialId: `urn:uuid:${randomUUID()}`,
  subjectId: 'urn:headlamp:candidate:e9b1a2f4',   // opaque id — never PII
  issuer,
  evidence: {basis: 'documents', placement},
  validFrom: new Date().toISOString(),
  status: {statusListCredential: 'https://myheadlamp.com/status/skillbridge/1', statusListIndex: 7},
});

// State 2: supervisor attestation → asserts COMPLETION.
// "Completed a DoD SkillBridge at CoolSys Inc., January 6 – April 25, 2026.
//  Confirmed by Dana Whitfield, Field Operations Manager."
const attested = buildAchievementCredential({
  credentialId: `urn:uuid:${randomUUID()}`,
  subjectId: 'urn:headlamp:candidate:e9b1a2f4',
  issuer,
  evidence: {
    basis: 'attestation',
    placement,
    attestation: {supervisorName: 'Dana Whitfield', supervisorTitle: 'Field Operations Manager'},
  },
  validFrom: new Date().toISOString(),
});

// State 3: both → placement sentence followed by completion sentence.
const both = buildAchievementCredential({
  credentialId: `urn:uuid:${randomUUID()}`,
  subjectId: 'urn:headlamp:candidate:e9b1a2f4',
  issuer,
  evidence: {
    basis: 'both',
    placement,
    attestation: {supervisorName: 'Dana Whitfield', supervisorTitle: 'Field Operations Manager'},
  },
  validFrom: new Date().toISOString(),
});

// Builders are pure; signing is a separate step:
const signed = await signCredential({credential: both, key});
```

Trying to claim completion without an attestation does not compile:

```ts
// ✗ Type error — 'attestation' variant requires an attestation object:
buildAchievementCredential({..., evidence: {basis: 'attestation', placement}});
```

## 2. Issue an endorsement

Each endorsement is its own signed OBv3 `EndorsementCredential` referencing
the base credential by id. Kinds: `work_confirmed`, `would_hire`, `was_hired`.

```ts
import {buildEndorsementCredential, signCredential} from 'headlamp-credentials';

const endorsement = buildEndorsementCredential({
  credentialId: `urn:uuid:${randomUUID()}`,
  kind: 'work_confirmed',
  baseCredentialId: signed.id as string,
  endorser: {id: 'did:web:coolsys.example', name: 'CoolSys Inc.'},
  validFrom: new Date().toISOString(),
  comment: 'Optional free-text remark.',        // appended to the standard statement
});
const signedEndorsement = await signCredential({credential: endorsement, key: endorserKey});
```

## 3. Build / refresh the revocation status list

The platform owns the set of revoked indices and republishes the signed list
at a stable URL whenever it changes. Credentials point at `(URL, index)` via
the `status` parameter above.

```ts
import {buildStatusListCredential} from 'headlamp-credentials';

const statusList = await buildStatusListCredential({
  id: 'https://myheadlamp.com/status/skillbridge/1',  // where the platform serves it
  issuer,                       // must be the same issuer as the credentials
  key,
  revokedIndices: [7, 4102],    // current full revocation set
  validFrom: new Date().toISOString(),
});
// → serve `statusList` (signed JSON) at the id URL. Refresh = call again
//   with the updated index set and overwrite.
```

## 4. Build an offline bundle with a chosen endorsement subset

A bundle is one JSON file that verifies with zero network access. Include
**exactly** the endorsements the veteran chose to share — nothing marks the
others as existing.

```ts
import {buildBundle} from 'headlamp-credentials';

const bundle = buildBundle({
  credential: signed,
  endorsements: [signedEndorsement],           // the chosen subset (may be [])
  didDocuments: [issuerDidDocument, endorserDidDocument],  // key snapshots
  statusListCredentials: [statusList],         // revocation snapshot
});
await fs.writeFile('bundle.json', JSON.stringify(bundle, null, 2));
```

## 5. Verify

**Offline (bundle):**

```ts
import {verifyBundle} from 'headlamp-credentials';

const result = await verifyBundle(JSON.parse(await fs.readFile('bundle.json', 'utf8')));
result.verified;                    // overall boolean
result.credential;                  // {signatureVerified, withinValidity, notRevoked, errors}
result.endorsements;                // per-endorsement checks + referencesCredential + kind
```

**Online (individual credential, resolving live documents):** verification
takes a document loader, so the platform decides how DID documents and
status lists are fetched:

```ts
import {createOfflineDocumentLoader, verifyCredentialDocument} from 'headlamp-credentials';

// Resolve the issuer DID document + current status list however you like
// (HTTP fetch of https://myheadlamp.com/.well-known/did.json etc.), then:
const loader = createOfflineDocumentLoader({
  didDocuments: [fetchedDidDocument],
  extraDocuments: [fetchedStatusList],
});
const check = await verifyCredentialDocument({credential: signed, documentLoader: loader});
```

(The "offline" loader is simply a closed-world loader — online verification
is the same call with freshly fetched inputs. Nothing in the library issues
network requests itself.)

**From a terminal:**

```sh
npx headlamp-credentials verify bundle.json          # human-readable report
npx headlamp-credentials verify bundle.json --json   # machine-readable
# exit codes: 0 verified · 1 not verified · 2 usage/IO error
```

## API surface at a glance

| Function | Purpose |
| --- | --- |
| `importKey(material)` | Injected key material → signing key (the only key entry point) |
| `generateKeyPair({id, controller})` | Provision a new key pair (store output in secret store) |
| `buildDidWebDocument({domain, publicKeys})` | DID document for the well-known path; multi-key |
| `didWeb(domain)` / `didWebDocumentUrl(did)` | DID ↔ URL mapping |
| `assertionText(evidence)` | The three-pattern assertion engine (pure) |
| `buildAchievementCredential(params)` | Unsigned OBv3 AchievementCredential (pure) |
| `buildEndorsementCredential(params)` | Unsigned OBv3 EndorsementCredential (pure) |
| `signCredential({credential, key, proofDate?})` | Sign with eddsa-rdfc-2022 |
| `buildStatusListCredential({id, issuer, key, revokedIndices})` | Build/refresh signed revocation list |
| `checkRevocation({credential, documentLoader})` | Status check against a list |
| `buildBundle({credential, endorsements, didDocuments, statusListCredentials})` | Offline bundle (pure) |
| `verifyBundle(bundle, {now?})` | Full offline verification |
| `verifyCredentialDocument({credential, documentLoader, now?})` | Verify one credential |
| `createOfflineDocumentLoader({didDocuments, extraDocuments})` | Closed-world document loader |

Types: `EvidenceBasis`, `PlacementDetails`, `SupervisorAttestation`,
`IssuerProfile`, `KeyMaterial`, `CredentialBundle`,
`BundleVerificationResult`, `EndorsementKind`, `DidDocument`.

## Notes for the platform

- **Subject ids:** pass opaque identifiers (`urn:headlamp:candidate:…`).
  Never put veteran PII in `subjectId`; names appear only where the product
  requires them (supervisor name/title inside attestation text).
- **Determinism:** Ed25519 signing is deterministic. With a fixed
  `proofDate`, identical inputs produce byte-identical signed documents —
  useful for idempotent re-issue and for tests.
- **Key rotation:** issue new credentials with `#key-2` while `#key-1`
  stays in the DID document until every credential signed with it has
  expired or been re-issued. Removing a key from the document invalidates
  online verification of its credentials (bundles keep verifying via their
  snapshot — snapshots pin the key set at bundling time).
