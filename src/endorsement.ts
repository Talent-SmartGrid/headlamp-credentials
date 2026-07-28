/**
 * EndorsementCredential builders — one signed OBv3 EndorsementCredential per
 * endorsement kind, referencing the base credential by id.
 */
import {OB_V3_CONTEXT_URL, VC_V2_CONTEXT_URL} from './contexts.js';
import type {EndorsementKind, IsoDateTime, IssuerProfile, UnsignedCredential} from './types.js';

export const ENDORSEMENT_KINDS: readonly EndorsementKind[] = [
  'work_confirmed',
  'would_hire',
  'was_hired',
] as const;

const ENDORSEMENT_STATEMENTS: Record<EndorsementKind, string> = {
  work_confirmed:
    'The endorser confirms that the SkillBridge work described in the ' +
    'referenced credential was performed under its supervision.',
  would_hire:
    'The endorser states that, given the opportunity, it would hire the ' +
    'holder of the referenced credential.',
  was_hired:
    'The endorser states that the holder of the referenced credential was ' +
    'hired by the endorser following the SkillBridge program.',
};

/** Parse the kind back out of a signed endorsement's `name`. */
export function endorsementKindOf(credential: Record<string, unknown>): EndorsementKind | undefined {
  const name = credential['name'];
  if (typeof name !== 'string') return undefined;
  const m = /^Headlamp SkillBridge Endorsement: (\w+)$/.exec(name);
  return ENDORSEMENT_KINDS.find(k => k === m?.[1]);
}

export interface EndorsementParams {
  /** This endorsement credential's own id, e.g. `urn:uuid:<uuid>`. */
  credentialId: string;
  kind: EndorsementKind;
  /** Id of the AchievementCredential being endorsed. */
  baseCredentialId: string;
  /** Endorsing party (host organization), embedded as the credential issuer. */
  endorser: IssuerProfile;
  validFrom: IsoDateTime;
  /** Optional free-text remark appended to the standard statement. */
  comment?: string;
}

/** Build an unsigned OBv3 EndorsementCredential. Sign with `signCredential`. */
export function buildEndorsementCredential(params: EndorsementParams): UnsignedCredential {
  const statement = ENDORSEMENT_STATEMENTS[params.kind];
  const endorsementComment = params.comment
    ? `${statement} ${params.comment}`
    : statement;
  return {
    '@context': [VC_V2_CONTEXT_URL, OB_V3_CONTEXT_URL],
    id: params.credentialId,
    type: ['VerifiableCredential', 'EndorsementCredential'],
    issuer: {
      id: params.endorser.id,
      type: ['Profile'],
      name: params.endorser.name,
      ...(params.endorser.url ? {url: params.endorser.url} : {}),
    },
    validFrom: params.validFrom,
    name: `Headlamp SkillBridge Endorsement: ${params.kind}`,
    credentialSubject: {
      id: params.baseCredentialId,
      type: ['EndorsementSubject'],
      endorsementComment,
    },
  };
}
