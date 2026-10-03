import { createApiHandler } from '../../../../lib/api-handler';
import { db } from '../../../../server/db';

/** Published, non-demo lessons any teacher can assign to a class. */
export const GET = createApiHandler(
  async () => {
    const lessons = await db.lesson.findMany({
      where: { status: 'PUBLISHED', OR: [{ unitId: null }, { unit: { isDemo: false } }] },
      orderBy: [{ unit: { term: { number: 'asc' } } }, { unit: { position: 'asc' } }, { position: 'asc' }],
      select: { id: true, title: true, subject: true, unit: { select: { title: true } } },
    });
    return { lessons };
  },
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);
