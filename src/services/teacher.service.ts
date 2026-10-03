/**
 * Tuklas 2.0 — Teacher Domain Service
 *
 * Manages teacher profiles, created classes, and teaching assignments.
 */

import { db } from '../server/db';
import { NotFoundError } from '../lib/errors';

export interface TeacherProfileUpdateData {
  displayName?: string;
  department?: string;
  title?: string;
  specialization?: string;
  schoolName?: string;
  bio?: string;
}

export class TeacherService {
  /**
   * Retrieves a teacher's full profile including department and managed classes.
   */
  static async getProfile(userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        teacherProfile: true,
        ownedClasses: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            _count: {
              select: { members: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError(`Teacher with ID "${userId}" not found.`);
    }

    return user;
  }

  /**
   * Updates teacher profile information.
   */
  static async updateProfile(userId: string, data: TeacherProfileUpdateData) {
    return db.$transaction(async (tx) => {
      if (data.displayName) {
        await tx.user.update({
          where: { id: userId },
          data: { displayName: data.displayName },
        });
      }

      const profile = await tx.teacherProfile.upsert({
        where: { userId },
        update: {
          department: data.department,
          title: data.title,
          specialization: data.specialization,
          schoolName: data.schoolName,
          bio: data.bio,
        },
        create: {
          userId,
          department: data.department,
          title: data.title,
          specialization: data.specialization,
          schoolName: data.schoolName,
          bio: data.bio,
        },
      });

      return profile;
    });
  }

  /**
   * Retrieves classes managed by a teacher.
   */
  static async getManagedClasses(teacherId: string) {
    return db.class.findMany({
      where: { teacherId },
      include: {
        _count: {
          select: { members: true, assignments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
