/**
 * Tuklas 2.0 — Student Domain Service
 *
 * Manages student profiles, enrolled classes, and student-specific settings.
 */

import { db } from '../server/db';
import { NotFoundError } from '../lib/errors';

export interface StudentProfileUpdateData {
  displayName?: string;
  studentNumber?: string;
  gradeLevel?: string;
  section?: string;
  schoolName?: string;
  bio?: string;
}

export class StudentService {
  /**
   * Retrieves a student's full profile including academic metadata.
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
        studentProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundError(`Student with ID "${userId}" not found.`);
    }

    return user;
  }

  /**
   * Updates student profile information.
   */
  static async updateProfile(userId: string, data: StudentProfileUpdateData) {
    return db.$transaction(async (tx) => {
      if (data.displayName) {
        await tx.user.update({
          where: { id: userId },
          data: { displayName: data.displayName },
        });
      }

      const profile = await tx.studentProfile.upsert({
        where: { userId },
        update: {
          studentNumber: data.studentNumber,
          gradeLevel: data.gradeLevel,
          section: data.section,
          schoolName: data.schoolName,
          bio: data.bio,
        },
        create: {
          userId,
          studentNumber: data.studentNumber,
          gradeLevel: data.gradeLevel,
          section: data.section,
          schoolName: data.schoolName,
          bio: data.bio,
        },
      });

      return profile;
    });
  }

  /**
   * Retrieves classes in which the student is enrolled.
   */
  static async getEnrolledClasses(userId: string) {
    const memberships = await db.classMember.findMany({
      where: { userId },
      include: {
        class: {
          include: {
            teacher: {
              select: { id: true, displayName: true, email: true },
            },
          },
        },
      },
    });

    return memberships.map((m) => ({
      ...m.class,
      joinedAt: m.joinedAt,
    }));
  }
}
