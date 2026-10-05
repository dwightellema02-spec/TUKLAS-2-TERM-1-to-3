/**
 * Tuklas 2.0 — Students report a bad tutor reply; teachers see the reports without names (owner pilot requirement).
 *
 * A report is tied to ONE assistant message in the student's OWN conversation (idempotent: reporting again updates it).
 * Class insights show a teacher the reports from their class's students: the reply text, the reason and the note, never who.
 */

import { z } from 'zod';
import { db } from '../server/db';
import { NotFoundError } from '../lib/errors';

export const REPORT_REASONS = ['WRONG_MATH', 'CONFUSING', 'UNSAFE', 'OTHER'] as const;

export const replyReportSchema = z.object({
  messageId: z.string().trim().min(1).max(100),
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(300).optional(),
});
export type ReplyReportInput = z.infer<typeof replyReportSchema>;

export class ReplyReportService {
  static async report(studentId: string, input: ReplyReportInput) {
    const message = await db.chatMessage.findFirst({
      where: { id: input.messageId, role: 'assistant', conversation: { studentId } },
      select: { id: true },
    });
    if (!message) throw new NotFoundError('Reply not found.');
    const note = input.note ? input.note.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || null : null;
    await db.replyReport.upsert({
      where: { messageId_studentId: { messageId: message.id, studentId } },
      update: { reason: input.reason, note },
      create: { messageId: message.id, studentId, reason: input.reason, note },
    });
    return { reported: true };
  }

  /** Reports from the given students, newest first, with the reply text and no student identity. */
  static async forStudents(studentIds: string[], limit = 5) {
    if (studentIds.length === 0) return { total: 0, recent: [] as Array<{ reason: string; note: string | null; reply: string; at: Date }> };
    const where = { studentId: { in: studentIds } };
    const [total, rows] = await Promise.all([
      db.replyReport.count({ where }),
      db.replyReport.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, select: { reason: true, note: true, createdAt: true, message: { select: { content: true } } } }),
    ]);
    return { total, recent: rows.map((row) => ({ reason: row.reason, note: row.note, reply: row.message.content.slice(0, 400), at: row.createdAt })) };
  }
}
