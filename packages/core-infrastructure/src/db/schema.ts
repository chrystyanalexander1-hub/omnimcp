import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  refreshTokenHash: text("refresh_token_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const connectorInstallations = pgTable("connector_installations", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  connectorId: text("connector_id").notNull(),
  installedByUserId: uuid("installed_by_user_id").notNull(),
  config: jsonb("config").notNull().default({}),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  uninstalledAt: timestamp("uninstalled_at", { withTimezone: true }),
});

export const credentialGrants = pgTable("credential_grants", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  connectorId: text("connector_id").notNull(),
  grantedByUserId: uuid("granted_by_user_id").notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const permissions = pgTable("permissions", {
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id").notNull(),
  connectorId: text("connector_id").notNull(),
  grantedByUserId: uuid("granted_by_user_id").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  actorUserId: uuid("actor_user_id").notNull(),
  qualifiedToolName: text("qualified_tool_name").notNull(),
  paramsHash: text("params_hash").notNull(),
  outcome: text("outcome").notNull(),
  errorMessage: text("error_message"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
