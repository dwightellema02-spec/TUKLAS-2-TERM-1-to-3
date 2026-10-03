/**
 * Tuklas 2.0 — Authentication & Security Audit Logger
 *
 * Emits structured security events for authentication lifecycle actions
 * while strictly preventing leakage of sensitive credentials, secrets, or raw tokens.
 */

export type AuthAuditEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'SESSION_REVOKED'
  | 'ACCOUNT_DISABLED'
  | 'ROLE_CHANGE'
  | 'REGISTRATION_ATTEMPT'
  | 'PRIVILEGE_ESCALATION_BLOCKED';

export interface AuthAuditEvent {
  event: AuthAuditEventType;
  userId?: string;
  email?: string;
  role?: string;
  ip?: string;
  userAgent?: string;
  success: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export class AuthAuditLogger {
  /**
   * Sanitizes metadata to ensure no passwords, secrets, or tokens are logged.
   */
  private static sanitize(data?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!data) return undefined;
    const clean: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'passwordhash', 'secret', 'token', 'cookie', 'auth_secret', 'apikey'];

    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        clean[key] = '[REDACTED]';
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }

  /**
   * Logs a security audit event in structured JSON.
   */
  static log(event: AuthAuditEvent): void {
    const entry = {
      event: event.event,
      timestamp: event.timestamp ?? new Date().toISOString(),
      userId: event.userId,
      email: event.email ? event.email.toLowerCase() : undefined,
      role: event.role,
      ip: event.ip,
      userAgent: event.userAgent,
      success: event.success,
      reason: event.reason,
      metadata: this.sanitize(event.metadata),
    };

    // In production, this can route to stdout / structured log aggregator
    if (process.env.NODE_ENV !== 'test') {
      console.info(`[AUTH_AUDIT] ${JSON.stringify(entry)}`);
    }
  }
}
