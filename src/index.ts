/**
 * headlamp-credentials — Open Badges 3.0 issuing & verification for the
 * Headlamp SkillBridge Credential. Pure functions in, signed JSON out.
 */
export * from './types.js';
export {assertionText, formatDateRange} from './assertion.js';
export {
  buildAchievementCredential,
  SKILLBRIDGE_ACHIEVEMENT,
  type AchievementCredentialParams,
  type AchievementDefinition,
} from './achievement.js';
export {
  buildEndorsementCredential,
  endorsementKindOf,
  ENDORSEMENT_KINDS,
  type EndorsementParams,
} from './endorsement.js';
export {
  buildDidWebDocument,
  didWeb,
  didWebDocumentUrl,
  type PublicKeyEntry,
} from './did.js';
export {
  importKey,
  generateKeyPair,
  publicKeyMultibaseFromRaw,
  type CredentialSigner,
  type KeyLike,
  type KeyMaterial,
  type SigningKey,
} from './keys.js';
export {signCredential, verificationSuite} from './sign.js';
export {
  buildStatusListCredential,
  checkRevocation,
  DEFAULT_STATUS_LIST_LENGTH,
} from './statuslist.js';
export {verifyCredentialDocument} from './verify.js';
export {assertBundleShape, buildBundle, verifyBundle} from './bundle.js';
export {
  bundleDocumentLoader,
  createOfflineDocumentLoader,
  OB_V3_CONTEXT_URL,
  VC_V2_CONTEXT_URL,
  type DocumentLoader,
} from './contexts.js';
