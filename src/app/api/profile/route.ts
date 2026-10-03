import { z } from 'zod';
import { db } from '../../../server/db';
import {
  getSessionFromRequest,
  jsonError,
  jsonSuccess,
} from '../../../server/auth';

const profileUpdateSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'Display name must be at least 2 characters.')
      .max(80, 'Display name is too long.')
      .optional(),
    studentNumber: z.string().trim().max(50).optional(),
    gradeLevel: z.string().trim().max(50).optional(),
    section: z.string().trim().max(50).optional(),
    department: z.string().trim().max(100).optional(),
    title: z.string().trim().max(100).optional(),
    specialization: z.string().trim().max(100).optional(),
    schoolName: z.string().trim().max(120).optional(),
    bio: z.string().trim().max(500).optional(),
  })
  .strict();

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      isActive: true,
      createdAt: true,
      studentProfile: true,
      teacherProfile: true,
    },
  });
  if (!user) return jsonError('Authentication required.', 401);

  return jsonSuccess({ user });
}

export async function PATCH(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  try {
    const raw = await request.json();
    const parsed = profileUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid profile input.',
        400,
      );
    }

    const {
      displayName,
      studentNumber,
      gradeLevel,
      section,
      department,
      title,
      specialization,
      schoolName,
      bio,
    } = parsed.data;

    const user = await db.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: session.sub },
        data: displayName ? { displayName } : {},
        select: { id: true, email: true, displayName: true, role: true },
      });

      if (updatedUser.role === 'STUDENT') {
        const studentProfile = await tx.studentProfile.upsert({
          where: { userId: session.sub },
          update: {
            studentNumber: studentNumber ?? undefined,
            gradeLevel: gradeLevel ?? undefined,
            section: section ?? undefined,
            schoolName: schoolName ?? undefined,
            bio: bio ?? undefined,
          },
          create: {
            userId: session.sub,
            studentNumber: studentNumber ?? null,
            gradeLevel: gradeLevel ?? null,
            section: section ?? null,
            schoolName: schoolName ?? null,
            bio: bio ?? null,
          },
        });
        return { ...updatedUser, studentProfile, teacherProfile: null };
      }

      if (updatedUser.role === 'TEACHER') {
        const teacherProfile = await tx.teacherProfile.upsert({
          where: { userId: session.sub },
          update: {
            department: department ?? undefined,
            title: title ?? undefined,
            specialization: specialization ?? undefined,
            schoolName: schoolName ?? undefined,
            bio: bio ?? undefined,
          },
          create: {
            userId: session.sub,
            department: department ?? null,
            title: title ?? null,
            specialization: specialization ?? null,
            schoolName: schoolName ?? null,
            bio: bio ?? null,
          },
        });
        return { ...updatedUser, studentProfile: null, teacherProfile };
      }

      return { ...updatedUser, studentProfile: null, teacherProfile: null };
    });

    return jsonSuccess({ user });
  } catch {
    return jsonError('Unable to update profile at this time.', 500);
  }
}
