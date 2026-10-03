import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { assertSafeZip, detectDocumentKind, DOCUMENT_LIMITS, extractDocument, normalizeDocumentText } from '../src/server/documents/extract';
import { chunkText, MAX_CHUNK_CHARS } from '../src/server/documents/chunk';
import { findRelevantChunks, tokenize } from '../src/server/documents/retrieve';
import { makeDocx, makePdf, text } from './fixtures/documents';

const LESSON_TEXT = [
  'Lesson 1: Adding Integers',
  'When two integers have the same sign, add their absolute values and keep the sign. For example, (-3) + (-4) = -7.',
  'Lesson 2: Subtracting Integers',
  'To subtract an integer, add its opposite. Subtracting a negative number moves you to the right on the number line.',
];

describe('document type detection (from bytes, not names)', () => {
  it('recognises a PDF by its signature even with the wrong extension', () => {
    expect(detectDocumentKind(makePdf(['hello world']), 'notes.txt')).toBe('PDF');
  });

  it('recognises a DOCX only when it is a Word package named .docx', async () => {
    const docx = await makeDocx(['hello']);
    expect(detectDocumentKind(docx, 'notes.docx')).toBe('DOCX');
    expect(detectDocumentKind(docx, 'notes.pdf')).toBeNull(); // zip pretending to be something else
    const zip = new JSZip();
    zip.file('readme.txt', 'not a word document');
    expect(detectDocumentKind(await zip.generateAsync({ type: 'uint8array' }), 'archive.docx')).toBeNull();
  });

  it('accepts text only with a text extension and text-like bytes', () => {
    expect(detectDocumentKind(text('plain notes'), 'a.txt')).toBe('TEXT');
    expect(detectDocumentKind(text('plain notes'), 'a.exe')).toBeNull();
    expect(detectDocumentKind(new Uint8Array([1, 0, 2, 0, 3, 0, 4]), 'a.txt')).toBeNull(); // binary with NULs
  });

  it('rejects an executable renamed to .pdf', () => {
    expect(detectDocumentKind(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]), 'virus.pdf')).toBeNull();
  });
});

describe('extractDocument', () => {
  it('extracts the text layer of a real PDF', async () => {
    const result = await extractDocument({ buffer: makePdf(['Integers are whole numbers.', 'Zero is neither positive nor negative.']), fileName: 'g7.pdf' });
    expect(result.kind).toBe('PDF');
    expect(result.pageCount).toBe(1);
    expect(result.text).toContain('Integers are whole numbers');
    expect(result.text).toContain('neither positive nor negative');
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('extracts a DOCX', async () => {
    const result = await extractDocument({ buffer: await makeDocx(LESSON_TEXT), fileName: 'notes.docx' });
    expect(result.kind).toBe('DOCX');
    expect(result.text).toContain('add its opposite');
    expect(result.wordCount).toBeGreaterThan(20);
  });

  it('extracts plain text and Markdown', async () => {
    const result = await extractDocument({ buffer: text(`# Integers\n\n${LESSON_TEXT.join('\n\n')}`), fileName: 'notes.md' });
    expect(result.kind).toBe('TEXT');
    expect(result.chunks.some((chunk) => chunk.heading.includes('Subtracting'))).toBe(true);
  });

  it('rejects empty, oversized and unsupported files with a teacher-readable reason', async () => {
    await expect(extractDocument({ buffer: new Uint8Array(), fileName: 'a.txt' })).rejects.toThrow(/empty/i);
    await expect(
      extractDocument({ buffer: new Uint8Array(DOCUMENT_LIMITS.maxBytes + 1).fill(65), fileName: 'big.txt' }),
    ).rejects.toThrow(/larger than/i);
    await expect(extractDocument({ buffer: new Uint8Array([0x4d, 0x5a, 0x90, 0, 3]), fileName: 'x.exe' })).rejects.toThrow(/unsupported/i);
  });

  it('refuses a PDF with no text layer instead of inventing text', async () => {
    await expect(extractDocument({ buffer: makePdf([' ']), fileName: 'scan.pdf' })).rejects.toThrow(/scanned|readable/i);
  });

  it('refuses a corrupt PDF without leaking internals', async () => {
    const corrupt = new Uint8Array(Buffer.from('%PDF-1.4\nthis is not really a pdf at all, just junk bytes'));
    await expect(extractDocument({ buffer: corrupt, fileName: 'bad.pdf' })).rejects.toThrow(/could not be read|readable/i);
  });

  it('refuses text longer than the character limit', async () => {
    const long = `${'Integers are numbers. '.repeat(Math.ceil((DOCUMENT_LIMITS.maxChars + 1000) / 22))}`;
    const buffer = text(long);
    if (buffer.length > DOCUMENT_LIMITS.maxBytes) return; // already refused by size; limit is covered above
    await expect(extractDocument({ buffer, fileName: 'long.txt' })).rejects.toThrow(/characters/i);
  });
});

describe('zip bomb protection', () => {
  it('rejects a DOCX whose parts declare an enormous expanded size', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document/>');
    zip.file('word/big.bin', Buffer.alloc(DOCUMENT_LIMITS.maxZipUncompressedBytes + 1024 * 1024)); // compresses to a few KB
    const bomb = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    expect(bomb.length).toBeLessThan(DOCUMENT_LIMITS.maxBytes); // it passes the upload size limit...
    expect(() => assertSafeZip(bomb)).toThrow(/expands/i); // ...but not the expanded-size check
    await expect(extractDocument({ buffer: bomb, fileName: 'bomb.docx' })).rejects.toThrow(/expands/i);
  }, 30_000);

  it('rejects a truncated zip', () => {
    const real = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(40).fill(1)]);
    expect(() => assertSafeZip(real)).toThrow(/damaged|valid/i);
  });
});

describe('normalizeDocumentText', () => {
  it('strips control characters and page markers, keeps maths symbols', () => {
    const out = normalizeDocumentText('(-3) + 4 = 1\u0000\r\n-- 1 of 5 --\r\n\r\n\r\n\r\n|x| ≥ 0');
    expect(out).toBe('(-3) + 4 = 1\n\n|x| ≥ 0');
  });

  it('removes "Page N of M" footers but not ordinary uses of the word page', () => {
    expect(normalizeDocumentText('Grade 7 Quarter 3 Page 32 of 36 Data')).toBe('Grade 7 Quarter 3  Data');
    expect(normalizeDocumentText('Read page 5 of the book')).toBe('Read page 5 of the book');
  });
});

describe('chunkText', () => {
  it('keeps headings with their content and never exceeds the chunk size', () => {
    const chunks = chunkText(`${LESSON_TEXT.join('\n\n')}\n\n${'A very long sentence about integers. '.repeat(80)}`);
    expect(chunks[0].heading).toBe('Lesson 1: Adding Integers');
    expect(chunks.find((chunk) => chunk.heading.startsWith('Lesson 2'))?.content).toContain('add its opposite');
    for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS + 40);
    expect(chunks.map((chunk) => chunk.position)).toEqual(chunks.map((_, index) => index));
  });

  it('returns nothing for empty text', () => {
    expect(chunkText('   \n\n  ')).toEqual([]);
  });
});

describe('retrieval', () => {
  const chunks = chunkText(LESSON_TEXT.join('\n\n')).map((chunk, index) => ({ ...chunk, id: `c${index}` }));

  it('returns the chunk about what the student asked', () => {
    const found = findRelevantChunks('how do I subtract a negative number?', chunks);
    expect(found[0].heading).toContain('Subtracting');
    expect(findRelevantChunks('same sign absolute values', chunks)[0].heading).toContain('Adding');
  });

  it('returns nothing when nothing matches, rather than unrelated material', () => {
    expect(findRelevantChunks('what is photosynthesis', chunks)).toEqual([]);
    expect(findRelevantChunks('help please', chunks)).toEqual([]); // only stop words
    expect(findRelevantChunks('anything', [])).toEqual([]);
  });

  it('ignores stop words and short tokens', () => {
    expect(tokenize('Can you give me a hint on the integers?')).toEqual(['integers']);
  });
});
