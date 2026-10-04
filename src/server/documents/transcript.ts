/**
 * Tuklas 2.0 — Video caption files (.srt / .vtt) as lesson reference material (master plan §8).
 *
 * Tuklas does NOT download videos or fetch captions from any site: the teacher supplies the caption file
 * and we read only its text and timings. Each chunk is a short time window labelled "Video m:ss–m:ss", so
 * the tutor can point a student to the part of the video that matches their question.
 */

import type { TextChunk } from './chunk';
import { MAX_CHUNK_CHARS } from './chunk';

export type Cue = { start: number; end: number; text: string };

export const CAPTION_LIMITS = {
  maxCues: 20_000,
  /** A chunk covers about this many seconds of video before a new one starts. */
  windowSeconds: 45,
} as const;

const TIMESTAMP = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{3})/;
const TIMING_LINE = new RegExp(`(${TIMESTAMP.source})\\s*-->\\s*(${TIMESTAMP.source})`);

function toSeconds(hours: string | undefined, minutes: string, seconds: string, millis: string): number {
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

export function formatTimestamp(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** Caption text is plain text only: markup, styling codes and control characters are removed. */
function cleanCueLine(line: string): string {
  return line
    .replace(/<[^>]*>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the text looks like a WebVTT or SubRip caption file. */
export function looksLikeCaptions(text: string): boolean {
  const head = text.replace(/^﻿/, '').trimStart();
  return /^WEBVTT/.test(head) || TIMING_LINE.test(text.slice(0, 20_000));
}

/**
 * Parse WebVTT or SubRip text into cues. Cues with unreadable or backwards timings are skipped, and
 * lines repeated by "rolling" auto-captions are collapsed so the same words are not stored twice.
 */
export function parseCaptions(raw: string): Cue[] {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues: Cue[] = [];
  let lastLine = '';

  for (const block of text.split(/\n\s*\n/)) {
    if (cues.length >= CAPTION_LIMITS.maxCues) break;
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => TIMING_LINE.test(line));
    if (timingIndex < 0) continue; // header, NOTE, STYLE, REGION, or a cue number on its own
    const match = TIMING_LINE.exec(lines[timingIndex])!;
    // Groups: 1 start, 2-5 its parts; 6 end, 7-10 its parts.
    const start = toSeconds(match[2], match[3], match[4], match[5]);
    const end = toSeconds(match[7], match[8], match[9], match[10]);
    if (!(end >= start)) continue;

    const kept: string[] = [];
    for (const line of lines.slice(timingIndex + 1)) {
      const cleaned = cleanCueLine(line);
      if (!cleaned || cleaned === lastLine) continue;
      kept.push(cleaned);
      lastLine = cleaned;
    }
    if (kept.length > 0) cues.push({ start, end, text: kept.join(' ') });
  }
  return cues;
}

/** Group cues into time windows; each chunk is labelled with the range of video it covers. */
export function chunkCaptions(cues: Cue[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let group: Cue[] = [];
  let size = 0;

  const flush = () => {
    if (group.length === 0) return;
    chunks.push({
      position: chunks.length,
      heading: `Video ${formatTimestamp(group[0].start)}–${formatTimestamp(group[group.length - 1].end)}`,
      content: group.map((cue) => cue.text).join(' '),
    });
    group = [];
    size = 0;
  };

  for (const cue of cues) {
    const tooLong = group.length > 0 && cue.start - group[0].start >= CAPTION_LIMITS.windowSeconds;
    const tooBig = group.length > 0 && size + cue.text.length + 1 > MAX_CHUNK_CHARS;
    if (tooLong || tooBig) flush();
    // A single very long cue is cut on its own so no chunk exceeds the limit.
    if (cue.text.length > MAX_CHUNK_CHARS) {
      for (let i = 0; i < cue.text.length; i += MAX_CHUNK_CHARS) {
        group = [{ ...cue, text: cue.text.slice(i, i + MAX_CHUNK_CHARS) }];
        flush();
      }
      continue;
    }
    group.push(cue);
    size += cue.text.length + 1;
  }
  flush();
  return chunks;
}
