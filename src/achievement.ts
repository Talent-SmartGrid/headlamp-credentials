/**
 * AchievementCredential builder — OBv3 (3.0.3) over the VC 2.0 data model.
 * Pure function: parameters in, unsigned JSON out. Sign with `signCredential`.
 */
import {assertionText} from './assertion.js';
import {OB_V3_CONTEXT_URL, VC_V2_CONTEXT_URL} from './contexts.js';
import type {
  CredentialStatusRef,
  EvidenceBasis,
  IsoDateTime,
  IssuerProfile,
  UnsignedCredential,
} from './types.js';

/** The achievement being asserted. Defaults describe the Headlamp SkillBridge Credential. */
export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  criteriaNarrative: string;
}

export const SKILLBRIDGE_ACHIEVEMENT: AchievementDefinition = {
  id: 'https://myheadlamp.com/achievements/skillbridge-credential',
  name: 'Headlamp SkillBridge Credential',
  description:
    'Recognizes a service member’s participation in a DoD SkillBridge ' +
    'program facilitated and verified by Headlamp.',
  criteriaNarrative:
    'Awarded on the basis of Headlamp-verified SkillBridge placement ' +
    'documents (offer letter and training plan) and/or a host-supervisor ' +
    'attestation of completion. The evidence narrative on each credential ' +
    'states exactly which basis applies.',
};

export interface AchievementCredentialParams {
  /** Credential id, e.g. `urn:uuid:<uuid>`. Caller supplies it (keeps builds pure). */
  credentialId: string;
  /** Recipient identifier (a DID or opaque URI — never PII). */
  subjectId: string;
  issuer: IssuerProfile;
  /** Evidence basis; drives the assertion text. See `EvidenceBasis`. */
  evidence: EvidenceBasis;
  validFrom: IsoDateTime;
  validUntil?: IsoDateTime;
  /** Revocation slot in a published status list. */
  status?: CredentialStatusRef;
  /** Override the default SkillBridge achievement definition. */
  achievement?: AchievementDefinition;
}

/** Build an unsigned OBv3 AchievementCredential. */
export function buildAchievementCredential(params: AchievementCredentialParams): UnsignedCredential {
  const achievement = params.achievement ?? SKILLBRIDGE_ACHIEVEMENT;
  const narrative = assertionText(params.evidence);
  const credential: UnsignedCredential = {
    '@context': [VC_V2_CONTEXT_URL, OB_V3_CONTEXT_URL],
    id: params.credentialId,
    type: ['VerifiableCredential', 'AchievementCredential'],
    issuer: {
      id: params.issuer.id,
      type: ['Profile'],
      name: params.issuer.name,
      ...(params.issuer.url ? {url: params.issuer.url} : {}),
    },
    validFrom: params.validFrom,
    ...(params.validUntil ? {validUntil: params.validUntil} : {}),
    name: achievement.name,
    credentialSubject: {
      id: params.subjectId,
      type: ['AchievementSubject'],
      achievement: {
        id: achievement.id,
        type: ['Achievement'],
        name: achievement.name,
        description: achievement.description,
        criteria: {narrative: achievement.criteriaNarrative},
      },
    },
    evidence: [
      {
        id: `${params.credentialId}#evidence-1`,
        type: ['Evidence'],
        name: `Evidence basis: ${params.evidence.basis}`,
        narrative,
      },
    ],
    ...(params.status
      ? {
          credentialStatus: {
            id: `${params.status.statusListCredential}#${params.status.statusListIndex}`,
            type: 'BitstringStatusListEntry',
            statusPurpose: 'revocation',
            statusListIndex: String(params.status.statusListIndex),
            statusListCredential: params.status.statusListCredential,
          },
        }
      : {}),
  };
  return credential;
}
