import { SessionId, TenantId, UserId } from "../ids.js";

export interface Session {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly tenantId: TenantId;
  /** Hash of the refresh token, never the token itself. */
  readonly refreshTokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export function isSessionActive(session: Session, now: Date = new Date()): boolean {
  return session.revokedAt === null && session.expiresAt > now;
}
