/**
 * Tuklas 2.0 — Lesson reference documents (master plan §8, §6, §23).
 *
 * A teacher (or admin) attaches a PDF / DOCX / text file to a lesson they control. Only the extracted
 * text is stored, split into chunks. The tutor retrieves the few chunks relevant to a student's
 * question and treats them as teacher material, never as instructions.
 */

import { db } from '../server/db';
import { AuthorizationError, NotFoundError, ValidationError } from '../lib/errors';
import { extractDocument } from '../server/documents/extract';
import { findRelevantChunks } from '../server/documents/retrieve';
import type { UserRole } from '../types/domain';

export const MAX_DOCUMENTS_PER_LESSON = 10;

type Actor = { id: string; role: UserRole };

const publicDocument = (doc: {
  id: string;
  fileName: string;
  kind: string;
  byteSize: number;
  pageCount: number | null;
  charCount: number;
  wordCount: number;
  createdAt: Date;
  _count?: { chunks: number };
}) => ({
  id: doc.id,
  fileName: doc.fileName,
  kind: doc.kind,
  byteSize: doc.byteSize,
  pageCount: doc.pageCount,
  charCount: doc.charCount,
  wordCount: doc.wordCount,
  chunkCount: doc._count?.chunks ?? null,
  createdAt: doc.createdAt,
});

export class DocumentService {
  private static async requireLessonControl(lessonId: string, actor: Actor) {
    const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { id: true, authorId: true } });
    if (!lesson) throw new NotFoundError('Lesson not found.');
    if (actor.role !== 'ADMIN' && lesson.authorId !== actor.id) {
      throw new AuthorizationError('You are not authorized to manage this lesson.');
    }
    return lesson;
  }

  static async list(lessonId: string, actor: Actor) {
    await this.requireLessonControl(lessonId, actor);
    const docs = await db.lessonDocument.findMany({
      where: { lessonId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { chunks: true } } },
    });
    return docs.map(publicDocument);
  }

  static async add(lessonId: string, actor: Actor, file: { name: string; buffer: Uint8Array }) {
    await this.requireLessonControl(lessonId, actor);
    const existing = await db.lessonDocument.count({ where: { lessonId, isActive: true } });
    if (existing >= MAX_DOCUMENTS_PER_LESSON) {
      throw new ValidationError(`A lesson can have at most ${MAX_DOCUMENTS_PER_LESSON} documents. Remove one first.`);
    }

    // Throws a ValidationError with a teacher-readable reason when the file cannot be used.
    const extracted = await extractDocument({ buffer: file.buffer, fileName: file.name });

    const doc = await db.lessonDocument.create({
      data: {
        lessonId,
        uploadedById: actor.id,
        // Only a plain base name is kept: no paths, no control characters.
        fileName: file.name.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) || 'document',
        kind: extracted.kind,
        byteSize: file.buffer.length,
        pageCount: extracted.pageCount,
        charCount: extracted.charCount,
        wordCount: extracted.wordCount,
        chunks: {
          create: extracted.chunks.map((chunk) => ({
            lessonId,
            position: chunk.position,
            heading: chunk.heading,
            content: chunk.content,
          })),
        },
      },
      include: { _count: { select: { chunks: true } } },
    });
    return publicDocument(doc);
  }

  static async remove(lessonId: string, documentId: string, actor: Actor) {
    await this.requireLessonControl(lessonId, actor);
    const doc = await db.lessonDocument.findFirst({ where: { id: documentId, lessonId, isActive: true }, select: { id: true } });
    if (!doc) throw new NotFoundError('Document not found.');
    await db.lessonDocument.delete({ where: { id: doc.id } });
  }

  /**
   * The few chunks of a lesson's documents that best match the student's words. Empty when the lesson
   * has no documents or nothing matches.
   */
  static async relevantForTutor(lessonId: string, query: string, limit = 3) {
    const chunks = await db.documentChunk.findMany({
      where: { lessonId, document: { isActive: true } },
      select: { id: true, heading: true, content: true, position: true, document: { select: { fileName: true } } },
      take: 400,
    });
    return findRelevantChunks(
      query,
      chunks.map((chunk) => ({ ...chunk, fileName: chunk.document.fileName })),
      limit,
    ).map((chunk) => ({ heading: chunk.heading, content: chunk.content, fileName: chunk.fileName }));
  }
}
