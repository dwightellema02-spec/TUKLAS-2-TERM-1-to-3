import { db } from '../../../server/db';
import {
  getSessionFromRequest,
  jsonError,
  jsonSuccess,
} from '../../../server/auth';
import { CurriculumService } from '../../../services/curriculum.service';
import { UserRole } from '../../../types/domain';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) return jsonError('Authentication required.', 401);

  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim() || undefined;
    const gradeParam = url.searchParams.get('gradeLevel');
    const gradeLevel = gradeParam ? parseInt(gradeParam, 10) : undefined;
    const subjectId = url.searchParams.get('subjectId')?.trim() || url.searchParams.get('subject')?.trim() || undefined;
    const statusParam = url.searchParams.get('status')?.trim();
    const status = (statusParam === 'DRAFT' || statusParam === 'PUBLISHED' || statusParam === 'ARCHIVED')
      ? statusParam
      : undefined;

    const subjects = await CurriculumService.getCurriculumHierarchy(
      user.role as UserRole,
      user.id,
      {
        search,
        gradeLevel: !isNaN(Number(gradeLevel)) ? gradeLevel : undefined,
        subjectId,
        status,
      },
    );
    return jsonSuccess({ subjects });
  } catch {
    return jsonError('Unable to load curriculum at this time.', 500);
  }
}
