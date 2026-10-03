/**
 * Tuklas 2.0 — Splits extracted document text into retrievable chunks (master plan §8).
 *
 * Chunks follow paragraphs and headings so a retrieved piece reads as a unit. Every chunk keeps the
 * heading it sits under, so retrieval can say where material came from.
 */

export type TextChunk = {
  position: number;
  heading: string;
  content: string;
};

export const MAX_CHUNK_CHARS = 900;

const HEADING = /^(?:#{1,4}\s+|(?:lesson|aralin|chapter|section|unit|module|week|topic)\s+\d+[:.\s-]|\d+\.\s+[A-Z])/i;

const isHeading = (paragraph: string) =>
  paragraph.length <= 90 && !/[.?!]$/.test(paragraph) && !paragraph.includes('\n') && (HEADING.test(paragraph) || /^[A-Z][A-Z0-9\s:&'()-]{3,}$/.test(paragraph));

/** Break one very long paragraph on sentence ends so no chunk exceeds the limit. */
function splitLong(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHUNK_CHARS) return [paragraph];
  const sentences = paragraph.split(/(?<=[.?!])\s+/);
  const pieces: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (sentence.length > MAX_CHUNK_CHARS) {
      if (current) pieces.push(current);
      current = '';
      for (let i = 0; i < sentence.length; i += MAX_CHUNK_CHARS) pieces.push(sentence.slice(i, i + MAX_CHUNK_CHARS));
      continue;
    }
    if (current && current.length + sentence.length + 1 > MAX_CHUNK_CHARS) {
      pieces.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

export function chunkText(text: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  let heading = 'Overview';
  let buffer: string[] = [];
  let size = 0;

  const flush = () => {
    const content = buffer.join('\n\n').trim();
    if (content) chunks.push({ position: chunks.length, heading, content });
    buffer = [];
    size = 0;
  };

  for (const raw of text.split(/\n\s*\n/)) {
    const paragraph = raw.trim();
    if (!paragraph) continue;

    if (isHeading(paragraph)) {
      flush();
      heading = paragraph.replace(/^#{1,4}\s+/, '').slice(0, 120);
      continue;
    }
    for (const piece of splitLong(paragraph)) {
      if (size + piece.length > MAX_CHUNK_CHARS && buffer.length > 0) flush();
      buffer.push(piece);
      size += piece.length;
    }
  }
  flush();
  return chunks;
}
