/**
 * Training-plan parser. Detects two in-house template families and parses
 * whichever one the text matches; anything else is `unknown` and routes to
 * human review platform-side. Detection is anchor-based: a document must
 * clear a minimum anchor score AND beat the other format's score, otherwise
 * the parser abstains.
 */

import type {
  CourseFields,
  CurriculumWeek,
  PlacementFields,
  SkillCandidate,
  TrainingPlanResult,
} from './types.js';
import {bulletText, flatten, group, normalize, snippet, toLines} from './text.js';
import {extractedDate} from './dates.js';

const WEEK_RE = /^Week\s+(\d+)\s*(?:\(([^)]*)\))?\s*:\s*(.*)$/i;
const DAY_RE = /^(?:[-*•]\s*)?Day\s+(\d+)\s*(?:\([^)]*\))?\s*:\s*(.*)$/i;
const OBJECTIVE_RE = /^Objective:\s*(.*)$/i;
const TITLE_HOURS_RE = /^(.*?)\s*\((\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\)\s*$/i;

/** Minimum anchor score a format must reach; the winner must also strictly
 * beat the other format, so an ambiguous document stays `unknown`. */
const DETECTION_THRESHOLD = 4;

function scoreCourse(text: string): number {
  let s = 0;
  if (/^Course Participant:/im.test(text)) s += 2;
  if (/^Training Outline Title:/im.test(text)) s += 2;
  if (/^Week\s+\d+\s*[(:]/im.test(text)) s += 2;
  if (/^Objective:/im.test(text)) s += 1;
  if (/^(?:[-*•]\s*)?Day\s+\d+\s*(?:\([^)]*\))?\s*:/im.test(text)) s += 1;
  return s;
}

function scorePlacement(text: string): number {
  let s = 0;
  if (/Instructor Qualification:/i.test(text)) s += 2;
  if (/Mentorship and instruction will be provided by/i.test(text)) s += 2;
  if (/^Job Title:/im.test(text)) s += 2;
  if (/^Job Description:/im.test(text)) s += 1;
  if (/hours per week/i.test(text)) s += 1;
  if (/fellowship/i.test(text)) s += 1;
  return s;
}

export function parseTrainingPlan(text: string): TrainingPlanResult {
  const norm = normalize(text);
  const course = scoreCourse(norm);
  const placement = scorePlacement(norm);
  if (course >= DETECTION_THRESHOLD && course > placement) return parseCourse(norm);
  if (placement >= DETECTION_THRESHOLD && placement > course) return parsePlacement(norm);
  return {format: 'unknown', confidence: 0, fields: {}};
}

function headerField(text: string, label: string): string | undefined {
  const m = new RegExp(`^${label}:\\s*(.+)$`, 'im').exec(text);
  return m === null ? undefined : group(m, 1);
}

function round2(points: number): number {
  return Math.round(points) / 100;
}

// ---------------------------------------------------------------------------
// Format A — course-style (e.g. Vets RISE)
// ---------------------------------------------------------------------------

function parseCourse(text: string): TrainingPlanResult {
  const participant = headerField(text, 'Course Participant');
  const trainingOutlineTitle = headerField(text, 'Training Outline Title');
  const duration = headerField(text, 'Duration');
  const location = headerField(text, 'Location');
  const hoursRaw = headerField(text, 'Hours');
  const hoursMatch = hoursRaw === undefined ? null : /^(\d+(?:\.\d+)?)/.exec(hoursRaw);
  const totalHours = hoursMatch === null ? undefined : Number(hoursMatch[1]);

  const weeks: CurriculumWeek[] = [];
  let current: CurriculumWeek | undefined;

  for (const line of toLines(text)) {
    if (line === '') continue;

    const wm = WEEK_RE.exec(line);
    if (wm !== null) {
      if (current !== undefined) weeks.push(current);
      const week: CurriculumWeek = {week: Number(group(wm, 1)), days: [], notes: []};
      const dateRange = group(wm, 2);
      if (dateRange !== undefined) week.dateRange = dateRange;
      const rest = group(wm, 3);
      if (rest !== undefined) {
        const th = TITLE_HOURS_RE.exec(rest);
        if (th !== null) {
          const title = group(th, 1);
          if (title !== undefined) week.title = title;
          week.hours = Number(group(th, 2));
        } else {
          week.title = rest;
        }
      }
      current = week;
      continue;
    }

    if (current === undefined) continue; // still in the header block

    const om = OBJECTIVE_RE.exec(line);
    if (om !== null) {
      current.objective = group(om, 1) ?? '';
      continue;
    }

    const dm = DAY_RE.exec(line);
    if (dm !== null) {
      current.days.push({day: Number(group(dm, 1)), text: group(dm, 2) ?? ''});
      continue;
    }

    if (/holiday/i.test(line) || /guest speaker/i.test(line) || line.startsWith('*')) {
      current.notes.push(line);
      continue;
    }

    // Wrapped continuation of the previous day/objective line, else a note.
    const lastDay = current.days[current.days.length - 1];
    if (lastDay !== undefined) {
      lastDay.text += ' ' + line;
    } else if (current.objective !== undefined) {
      current.objective += ' ' + line;
    } else {
      current.notes.push(line);
    }
  }
  if (current !== undefined) weeks.push(current);

  const skillCandidates: SkillCandidate[] = [];
  for (const week of weeks) {
    for (const day of week.days) {
      const context = snippet(`Week ${week.week}, Day ${day.day}: ${day.text}`);
      for (const segment of day.text.split(/;|•/)) {
        const label = segment.trim().replace(/\.$/, '');
        if (label.length < 3) continue;
        skillCandidates.push({label, sourceSection: 'curriculum_day', context});
      }
    }
  }

  let points = 0;
  if (participant !== undefined) points += 20;
  if (trainingOutlineTitle !== undefined) points += 15;
  if (duration !== undefined) points += 5;
  if (location !== undefined) points += 5;
  if (totalHours !== undefined) points += 5;
  if (weeks.length > 0) points += 20;
  if (weeks.some((w) => w.objective !== undefined)) points += 15;
  if (weeks.some((w) => w.days.length > 0)) points += 15;

  const fields: CourseFields = {
    ...(participant !== undefined ? {participant} : {}),
    ...(trainingOutlineTitle !== undefined ? {trainingOutlineTitle} : {}),
    ...(duration !== undefined ? {duration} : {}),
    ...(location !== undefined ? {location} : {}),
    ...(totalHours !== undefined ? {totalHours} : {}),
    weeks,
    skillCandidates,
  };
  return {format: 'course', confidence: round2(points), fields};
}

// ---------------------------------------------------------------------------
// Format B — placement-style
// ---------------------------------------------------------------------------

/** `[Name], [Title] at [Host]` where the name is 1–5 capitalized tokens.
 * A non-name subject ("the site operations team") fails on purpose — the
 * parser abstains instead of guessing a name/title split. */
const PROVIDED_BY_RE =
  /provided by\s+((?:[A-Z][\w.'-]*\s*){1,5}),\s+([^.]{2,80}?)\s+at\s+([^.]{2,80}?)[.,;]/;

const FELLOWSHIP_HEADER_RES = [
  /fellowship (?:of|for)\s+(.{2,60}?)\s+(?:with|at|hosted by)\s+(.{2,60}?)(?=[.,;]|\s+from\s|\s+beginning\s|\s+running\s|$)/i,
  /training plan for\s+(.{2,60}?)\s+(?:with|at|hosted by)\s+(.{2,60}?)(?=[.,;]|\s+from\s|\s+beginning\s|\s+running\s|$)/i,
];

/** Each side is a short date-like chunk; a comma is allowed only when it
 * introduces a 4-digit year ("June 2, 2025"), so list commas terminate. */
const DATE_RANGE_RE =
  /(?:from|beginning)\s+([A-Za-z0-9][A-Za-z0-9/ ]{1,20}(?:,\s*\d{4})?)\s+(?:to|through|until)\s+([A-Za-z0-9][A-Za-z0-9/ ]{1,20}(?:,\s*\d{4})?)(?=[.,;)]|$)/gi;

function collectBullets(lines: string[], headingIndex: number): string[] {
  const items: string[] = [];
  for (let i = headingIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line === '') {
      if (items.length > 0) break;
      continue;
    }
    const bullet = bulletText(line);
    if (bullet === undefined) break;
    items.push(bullet);
  }
  return items;
}

function parsePlacement(text: string): TrainingPlanResult {
  const lines = toLines(text);
  const flat = flatten(text);

  let participant: string | undefined;
  let host: string | undefined;
  for (const re of FELLOWSHIP_HEADER_RES) {
    const m = re.exec(flat);
    if (m !== null) {
      participant = group(m, 1);
      host = group(m, 2);
      break;
    }
  }

  let startRaw: string | undefined;
  let endRaw: string | undefined;
  for (const m of flat.matchAll(DATE_RANGE_RE)) {
    const a = m[1]?.trim();
    const b = m[2]?.trim();
    // Require digits so prose like "from day one to day five" can't bind.
    if (a !== undefined && b !== undefined && /\d/.test(a) && /\d/.test(b)) {
      startRaw = a;
      endRaw = b;
      break;
    }
  }

  let supervisor: {name: string; title: string} | undefined;
  const sm = PROVIDED_BY_RE.exec(flat);
  if (sm !== null) {
    const name = group(sm, 1);
    const title = group(sm, 2);
    if (name !== undefined && title !== undefined) supervisor = {name, title};
    if (host === undefined) host = group(sm, 3);
  }

  const jobTitle = headerField(text, 'Job Title');

  let jobDescription: string | undefined;
  const jdIndex = lines.findIndex((l) => /^Job Description:/i.test(l));
  if (jdIndex >= 0) {
    const parts: string[] = [];
    const inline = (lines[jdIndex] ?? '').replace(/^Job Description:\s*/i, '').trim();
    if (inline !== '') parts.push(inline);
    for (let i = jdIndex + 1; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (line === '' || /^[^:]{1,60}:\s*$/.test(line) || bulletText(line) !== undefined) break;
      parts.push(line);
    }
    if (parts.length > 0) jobDescription = parts.join(' ');
  }

  const respIndex = lines.findIndex((l) => /^(?:key\s+)?responsibilities:?$/i.test(l));
  const responsibilities = respIndex >= 0 ? collectBullets(lines, respIndex) : [];

  const skillsIndex = lines.findIndex((l) => /^skills\b[^:]*:?$/i.test(l));
  const skillsHeading = skillsIndex >= 0 ? (lines[skillsIndex] ?? '').replace(/:$/, '') : '';
  const skillsBullets = skillsIndex >= 0 ? collectBullets(lines, skillsIndex) : [];

  const weeklyHoursMatch =
    /(\d{1,3})\s*hours per week/i.exec(flat) ?? /Weekly Hours:\s*(\d{1,3})\b/i.exec(flat);
  const weeklyHours = weeklyHoursMatch === null ? undefined : Number(group(weeklyHoursMatch, 1));

  const skillCandidates: SkillCandidate[] = [
    ...skillsBullets.map((label) => ({
      label,
      sourceSection: 'skills_list' as const,
      context: snippet(`${skillsHeading}: ${label}`),
    })),
    ...responsibilities.map((label) => ({
      label,
      sourceSection: 'responsibilities' as const,
      context: snippet(`Responsibilities: ${label}`),
    })),
  ];

  let points = 0;
  if (participant !== undefined) points += 15;
  if (host !== undefined) points += 10;
  if (startRaw !== undefined) points += 5;
  if (endRaw !== undefined) points += 5;
  if (supervisor !== undefined) points += 15;
  if (jobTitle !== undefined) points += 10;
  if (jobDescription !== undefined) points += 10;
  if (responsibilities.length > 0) points += 10;
  if (skillsBullets.length > 0) points += 10;
  if (weeklyHours !== undefined) points += 10;

  const fields: PlacementFields = {
    ...(participant !== undefined ? {participant} : {}),
    ...(host !== undefined ? {host} : {}),
    ...(startRaw !== undefined ? {fellowshipStart: extractedDate(startRaw)} : {}),
    ...(endRaw !== undefined ? {fellowshipEnd: extractedDate(endRaw)} : {}),
    ...(supervisor !== undefined ? {supervisor} : {}),
    ...(jobTitle !== undefined ? {jobTitle} : {}),
    ...(jobDescription !== undefined ? {jobDescription} : {}),
    responsibilities,
    ...(weeklyHours !== undefined ? {weeklyHours} : {}),
    skillCandidates,
  };
  return {format: 'placement', confidence: round2(points), fields};
}
