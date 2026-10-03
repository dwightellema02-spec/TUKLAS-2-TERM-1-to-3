/**
 * Tuklas 2.0 — Teacher document text extraction (master plan §8, §23).
 *
 * Supports digital PDF, DOCX and plain text / Markdown. It deliberately does NOT do OCR: a scanned
 * (image-only) PDF is rejected with an honest message rather than producing empty or invented text.
 *
 * Safety:
 *   - the file type is decided from the file's own bytes (magic numbers), never from its name or
 *     the browser-supplied MIME type
 *   - hard limits on file size, page count, archive size and extracted characters
 *   - only plain text leaves this module: no HTML, no scripts, no embedded files
 */

import { ValidationError } from '../../lib/errors';
import { chunkText, type TextChunk } from './chunk';

export const DOCUMENT_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxPdfPages: 200,
  maxChars: 300_000,
  /** DOCX is a zip: refuse archives that declare absurd expanded size or entry counts. */
  maxZipUncompressedBytes: 50 * 1024 * 1024,
  maxZipEntries: 2_000,
} as const;

export type DocumentKind = 'PDF' | 'DOCX' | 'TEXT';

export type ExtractedDocument = {
  kind: DocumentKind;
  text: string;
  charCount: number;
  wordCount: number;
  pageCount: number | null;
  chunks: TextChunk[];
};

const startsWith = (buffer: Uint8Array, bytes: number[]) => bytes.every((byte, index) => buffer[index] === byte);

/** Decide the real type from the bytes. Returns null when the content is not a supported type. */
export function detectDocumentKind(buffer: Uint8Array, fileName: string): DocumentKind | null {
  if (buffer.length >= 5 && startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'PDF'; // %PDF-
  if (buffer.length >= 4 && startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    // A zip. Only a Word document is accepted, not any zip (xlsx, jar, apk...).
    return /\.docx$/i.test(fileName) && looksLikeDocx(buffer) ? 'DOCX' : null;
  }
  if (/\.(txt|text|md|markdown)$/i.test(fileName) && isProbablyText(buffer)) return 'TEXT';
  return null;
}

function isProbablyText(buffer: Uint8Array): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.length === 0) return false;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false; // NUL bytes: binary
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length < 0.02;
}

/** A DOCX stores its main part at word/document.xml; look for that name in the zip directory. */
function looksLikeDocx(buffer: Uint8Array): boolean {
  return Buffer.from(buffer).includes('word/document.xml');
}

/**
 * Read the zip central directory and reject archives that declare too many entries or too much
 * expanded data (zip bombs), before anything is decompressed.
 */
export function assertSafeZip(buffer: Uint8Array): void {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  // End Of Central Directory record: signature 0x06054b50, searched from the end.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65_535); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ValidationError('This file is damaged or is not a valid Word document.');

  const entries = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (entries > DOCUMENT_LIMITS.maxZipEntries) {
    throw new ValidationError('This document contains too many internal files to process safely.');
  }
  if (directoryOffset + directorySize > buffer.length) {
    throw new ValidationError('This file is damaged or is not a valid Word document.');
  }

  let offset = directoryOffset;
  let total = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new ValidationError('This file is damaged or is not a valid Word document.');
    }
    total += view.getUint32(offset + 24, true); // uncompressed size
    if (total > DOCUMENT_LIMITS.maxZipUncompressedBytes) {
      throw new ValidationError('This document expands to more data than can be processed safely.');
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

/** Plain text only: no control characters, normalised line endings, page-number noise removed. */
export function normalizeDocumentText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '\n')
    .replace(/\b(?:page|pahina)\s+\d+\s+of\s+\d+\b/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdf(buffer: Uint8Array): Promise<{ text: string; pages: number }> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const info = await parser.getInfo();
    const pages = info?.total ?? 0;
    if (pages > DOCUMENT_LIMITS.maxPdfPages) {
      throw new ValidationError(`This PDF has ${pages} pages; the limit is ${DOCUMENT_LIMITS.maxPdfPages}.`);
    }
    const result = await parser.getText();
    return { text: result.text ?? '', pages: pages || result.pages?.length || 0 };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocx(buffer: Uint8Array): Promise<string> {
  assertSafeZip(buffer);
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return result.value ?? '';
}

/**
 * Extract, normalise and chunk one uploaded document. Throws ValidationError (safe to show to the
 * teacher) for anything that cannot be turned into real text.
 */
export async function extractDocument(input: { buffer: Uint8Array; fileName: string }): Promise<ExtractedDocument> {
  const { buffer, fileName } = input;
  if (buffer.length === 0) throw new ValidationError('The file is empty.');
  if (buffer.length > DOCUMENT_LIMITS.maxBytes) {
    throw new ValidationError(`The file is larger than ${DOCUMENT_LIMITS.maxBytes / (1024 * 1024)} MB.`);
  }

  const kind = detectDocumentKind(buffer, fileName);
  if (!kind) {
    throw new ValidationError('Unsupported file. Upload a PDF, a Word document (.docx) or a text file (.txt, .md).');
  }

  let raw = '';
  let pageCount: number | null = null;
  try {
    if (kind === 'PDF') {
      const pdf = await extractPdf(buffer);
      raw = pdf.text;
      pageCount = pdf.pages;
    } else if (kind === 'DOCX') {
      raw = await extractDocx(buffer);
    } else {
      raw = Buffer.from(buffer).toString('utf-8');
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    // The teacher sees a safe message; operators get the real cause (never the document content).
    console.error(`[documents] ${kind} extraction failed:`, error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error');
    throw new ValidationError('The text could not be read from this file. It may be damaged or password-protected.');
  }

  const text = normalizeDocumentText(raw);
  if (text.length < 30) {
    throw new ValidationError(
      kind === 'PDF'
        ? 'No readable text was found. This looks like a scanned or image-only PDF; upload a digital PDF with selectable text.'
        : 'No readable text was found in this file.',
    );
  }
  if (text.length > DOCUMENT_LIMITS.maxChars) {
    throw new ValidationError(`The document has more than ${DOCUMENT_LIMITS.maxChars.toLocaleString('en-US')} characters of text; split it into smaller files.`);
  }

  const chunks = chunkText(text);
  return {
    kind,
    text,
    charCount: text.length,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    pageCount,
    chunks,
  };
}
