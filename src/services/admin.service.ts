/**
 * Tuklas 2.0 — Administrator user management (master plan §4 admin, §23).
 *
 * Rules enforced here, not in the UI:
 *  - only teacher and student accounts are managed; admin accounts can never be created,
 *    changed, deactivated or have their password reset through this console
 *  - an admin cannot act on their own account (no self-lockout, no self-demotion)
 *  - deactivating, changing the role of, or resetting the password of a user ends all of
 *    their sessions immediately
 *  - every action is written to the audit log with who did it
 */

import type { Prisma } from '@prisma/client';
import { db } from '../server/db';
import { hashPassword, validatePasswordPolicy } from '../lib/auth/password';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '../lib/errors';

export type ManagedRole = 'TEACHER' | 'STUDENT';

type Actor = { id: string };

export class AdminService {
  private static async audit(
    client: Prisma.TransactionClient | typeof db,
    actorId: string,
    action: string,
    targetUserId: string | null,
    details?: Prisma.InputJsonValue,
  ) {
    await client.adminAuditLog.create({
      data: { actorId, action, targetUserId, ...(details === undefined ? {} : { details }) },
    });
  }

  /** Loads a user an admin is allowed to manage. */
  private static async managedTarget(actor: Actor, userId: string) {
    if (userId === actor.id) {
      throw new AuthorizationError('You cannot change your own account here.');
    }
    const target = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, isActive: true, displayName: true },
    });
    if (!target) throw new NotFoundError('User not found.');
    if (target.role === 'ADMIN') {
      throw new AuthorizationError('Administrator accounts cannot be managed here.');
    }
    return target;
  }

  static async listUsers(filters: { role?: string; query?: string } = {}) {
    const where: Prisma.UserWhereInput = {};
    if (filters.role === 'TEACHER' || filters.role === 'STUDENT' || filters.role === 'ADMIN') {
      where.role = filters.role;
    }
    const query = filters.query?.trim();
    if (query) {
      where.OR = [
        { email: { contains: query, mode: 'insensitive' } },
        { displayName: { contains: query, mode: 'insensitive' } },
      ];
    }
    return db.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: { select: { ownedClasses: true, classMemberships: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
  }

  static async createUser(
    actor: Actor,
    input: { email: string; displayName: string; role: ManagedRole; password: string },
  ) {
    const email = input.email.trim().toLowerCase();
    const policy = validatePasswordPolicy(input.password);
    if (!policy.valid) throw new ValidationError(policy.errors[0] ?? 'Password is too weak.');

    if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictError('A user with this email already exists.');
    }

    const passwordHash = await hashPassword(input.password);
    return db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          displayName: input.displayName.trim(),
          role: input.role,
          passwordHash,
          isActive: true,
          ...(input.role === 'STUDENT' ? { studentProfile: { create: {} } } : { teacherProfile: { create: {} } }),
        },
        select: { id: true, email: true, displayName: true, role: true, isActive: true, createdAt: true },
      });
      await this.audit(tx, actor.id, 'USER_CREATED', user.id, { role: input.role, email });
      return user;
    });
  }

  static async setActive(actor: Actor, userId: string, active: boolean) {
    const target = await this.managedTarget(actor, userId);
    return db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: { isActive: active },
        select: { id: true, email: true, displayName: true, role: true, isActive: true },
      });
      if (!active) await tx.authSession.deleteMany({ where: { userId: target.id } });
      await this.audit(tx, actor.id, active ? 'USER_REACTIVATED' : 'USER_DEACTIVATED', target.id, {
        email: target.email,
      });
      return user;
    });
  }

  static async setRole(actor: Actor, userId: string, role: ManagedRole) {
    const target = await this.managedTarget(actor, userId);
    if (target.role === role) return { id: target.id, email: target.email, displayName: target.displayName, role: target.role, isActive: target.isActive };

    if (target.role === 'TEACHER') {
      const owned = await db.class.count({ where: { teacherId: target.id } });
      if (owned > 0) {
        throw new ConflictError('This teacher still owns classes. Archive or reassign them before changing the role.');
      }
    }

    return db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: {
          role,
          // Make sure the profile that matches the new role exists.
          ...(role === 'TEACHER'
            ? { teacherProfile: { connectOrCreate: { where: { userId: target.id }, create: {} } } }
            : { studentProfile: { connectOrCreate: { where: { userId: target.id }, create: {} } } }),
        },
        select: { id: true, email: true, displayName: true, role: true, isActive: true },
      });
      await tx.authSession.deleteMany({ where: { userId: target.id } });
      await this.audit(tx, actor.id, 'USER_ROLE_CHANGED', target.id, { from: target.role, to: role });
      return user;
    });
  }

  /** Sets a new password (there is no email service yet, so an admin hands it over in person). */
  static async resetPassword(actor: Actor, userId: string, newPassword: string) {
    const target = await this.managedTarget(actor, userId);
    const policy = validatePasswordPolicy(newPassword);
    if (!policy.valid) throw new ValidationError(policy.errors[0] ?? 'Password is too weak.');

    const passwordHash = await hashPassword(newPassword);
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
      await tx.authSession.deleteMany({ where: { userId: target.id } });
      await this.audit(tx, actor.id, 'PASSWORD_RESET', target.id, { email: target.email });
    });
  }

  static async listAudit(limit = 50) {
    const rows = await db.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: { actor: { select: { displayName: true, email: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.actor.displayName,
      targetUserId: row.targetUserId,
      details: row.details,
      createdAt: row.createdAt,
    }));
  }
}
