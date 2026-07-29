/**
 * headlamp-extraction — document text extraction prototype.
 *
 * Plain text in, structured field candidates out. This package is a parsing
 * utility only: it is NOT part of the audited signing core in `src/` and
 * nothing here touches keys, credentials, or proofs.
 */

export {parseTrainingPlan} from './trainingPlan.js';
export {parseOfferLetter} from './offerLetter.js';
export {toIso} from './dates.js';
export type {
  CourseFields,
  CurriculumDay,
  CurriculumWeek,
  ExtractedDate,
  OfferLetterResult,
  PlacementFields,
  SkillCandidate,
  SourceSection,
  TrainingPlanResult,
} from './types.js';
