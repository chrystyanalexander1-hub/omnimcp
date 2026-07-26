import { InvalidEntityError } from "../errors.js";
import { TenantId, UserId } from "../ids.js";

/** Tenant-scoped role. "owner" and "admin" may grant/revoke connector credentials and view audit logs; "member" may only execute tools they've been granted. */
export type Role = "owner" | "admin" | "member";

export interface User {
  readonly id: UserId;
  readonly tenantId: TenantId;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly createdAt: Date;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateUserInput {
  id: UserId;
  tenantId: TenantId;
  email: string;
  passwordHash: string;
  role?: Role;
  createdAt?: Date;
}

export function createUser(input: CreateUserInput): User {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new InvalidEntityError(`Invalid email address: ${input.email}`);
  }
  if (!input.passwordHash) {
    throw new InvalidEntityError("User must have a passwordHash (never a plaintext password)");
  }
  return Object.freeze({
    id: input.id,
    tenantId: input.tenantId,
    email,
    passwordHash: input.passwordHash,
    role: input.role ?? "member",
    createdAt: input.createdAt ?? new Date(),
  });
}

export function canManageConnectors(role: Role): boolean {
  return role === "owner" || role === "admin";
}

export function canViewAudit(role: Role): boolean {
  return role === "owner" || role === "admin";
}
