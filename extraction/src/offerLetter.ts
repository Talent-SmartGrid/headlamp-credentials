/**
 * Parser for the Headlamp offer-letter template. Every field hangs off an
 * anchor phrase from the template; a missing or malformed anchor means the
 * field is omitted and confidence drops. Nothing is inferred.
 */

import type {ExtractedDate, OfferLetterResult} from './types.js';
import {bulletText, flatten, group, normalize, toLines} from './text.js';
import {extractedDate, toIso} from './dates.js';

const OFFER_ANCHOR_RE = /offer of a Headlamp Fellowship/i;

/** `beginning [date] and ending approximately [date] with duty at [Host].` */
const FELLOWSHIP_SENTENCE_RE =
  /beginning\s+(.{3,40}?)\s+and\s+ending\s+(?:approximately\s+)?(.{3,40}?)\s+with\s+duty\s+at\s+(.{2,80}?)\.(?:\s|$)/i;

const LOCATED_AT_LINE_RE = /They are located at\s+(.+?)\.?\s*$/i;
const LOCATED_AT_FLAT_RE = /They are located at\s+(.+?)\.(?:\s|$)/i;

/** `[Name], [Title] at [Host]` — the name must look like a name (1–5
 * capitalized tokens) or the parser abstains. */
const SUPERVISOR_RE =
  /Your initial direct supervisor will be\s+((?:[A-Z][\w.'-]*\s*){1,5}),\s+([^.]{2,80}?)\s+at\s+([^.]{2,80}?)[.,;]/;

const ROLE_RE = /Your role will be (?:a|an)\s+(.{2,80}?)[.,]/i;

const INTENT_RE = /intends to extend (?:their|its) own offer/i;

const DUTIES_HEADING_RE = /^Duties\s*(?:&|and)\s*Responsibilities:?$/i;

export function parseOfferLetter(text: string): OfferLetterResult {
  const norm = normalize(text);
  const lines = toLines(norm);
  const flat = flatten(norm);

  // Date line: a standalone, fully-specified date near the top.
  let letterDate: ExtractedDate | undefined;
  let seen = 0;
  for (const line of lines) {
    if (line === '') continue;
    if (++seen > 8) break;
    const candidate = line.replace(/^Date:\s*/i, '');
    const iso = toIso(candidate);
    if (iso !== undefined) {
      letterDate = {raw: candidate, iso};
      break;
    }
  }

  const offerAnchor = OFFER_ANCHOR_RE.test(flat);

  let startDate: ExtractedDate | undefined;
  let endDate: ExtractedDate | undefined;
  let host: string | undefined;
  const fm = FELLOWSHIP_SENTENCE_RE.exec(flat);
  if (fm !== null) {
    const startRaw = group(fm, 1);
    const endRaw = group(fm, 2);
    if (startRaw !== undefined) startDate = extractedDate(startRaw);
    if (endRaw !== undefined) endDate = extractedDate(endRaw);
    host = group(fm, 3);
  }

  let address: string | undefined;
  const addressLine = lines.find((l) => /They are located at/i.test(l));
  if (addressLine !== undefined) {
    const am = LOCATED_AT_LINE_RE.exec(addressLine);
    if (am !== null) address = group(am, 1);
  }
  if (address === undefined) {
    const am = LOCATED_AT_FLAT_RE.exec(flat);
    if (am !== null) address = group(am, 1);
  }

  let supervisor: {name: string; title: string} | undefined;
  const sm = SUPERVISOR_RE.exec(flat);
  if (sm !== null) {
    const name = group(sm, 1);
    const title = group(sm, 2);
    if (name !== undefined && title !== undefined) supervisor = {name, title};
  }

  const rm = ROLE_RE.exec(flat);
  const roleTitle = rm === null ? undefined : group(rm, 1);

  const dutiesIndex = lines.findIndex((l) => DUTIES_HEADING_RE.test(l));
  const dutiesRaw: string[] = [];
  if (dutiesIndex >= 0) {
    for (let i = dutiesIndex + 1; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (line === '') {
        if (dutiesRaw.length > 0) break;
        continue;
      }
      const bullet = bulletText(line);
      if (bullet === undefined) break;
      dutiesRaw.push(bullet);
    }
  }

  const employmentIntent = INTENT_RE.test(flat);
  const signatureEvidence = /^Doc ID:/im.test(norm) || /Signed by/i.test(norm);

  let points = 0;
  if (offerAnchor) points += 15;
  if (startDate !== undefined) points += 10;
  if (endDate !== undefined) points += 10;
  if (host !== undefined) points += 10;
  if (address !== undefined) points += 10;
  if (supervisor !== undefined) points += 15;
  if (roleTitle !== undefined) points += 10;
  if (dutiesRaw.length > 0) points += 10;
  if (letterDate !== undefined) points += 5;
  if (signatureEvidence) points += 5;

  return {
    ...(letterDate !== undefined ? {letterDate} : {}),
    ...(host !== undefined ? {host} : {}),
    ...(address !== undefined ? {address} : {}),
    ...(startDate !== undefined ? {startDate} : {}),
    ...(endDate !== undefined ? {endDate} : {}),
    ...(roleTitle !== undefined ? {roleTitle} : {}),
    ...(supervisor !== undefined ? {supervisor} : {}),
    dutiesRaw,
    employmentIntent,
    signatureEvidence,
    confidence: Math.round(points) / 100,
  };
}
