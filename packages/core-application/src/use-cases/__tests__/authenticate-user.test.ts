import { beforeEach, describe, expect, it } from "vitest";
import { createUser, TenantId, UserId } from "@omnimcp/core-domain";
import { AuthenticateUser, InvalidCredentialsError } from "../authenticate-user.js";
import { IssueApiKey } from "../issue-api-key.js";
import {
  FakePasswordHasher,
  FakeTokenService,
  FixedClock,
  InMemoryApiKeyRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  Sha256CryptoService,
  UuidIdGenerator,
} from "./test-doubles.js";

const tenantId = TenantId("tenant-1");

describe("AuthenticateUser", () => {
  let users: InMemoryUserRepository;
  let sessions: InMemorySessionRepository;
  let passwordHasher: FakePasswordHasher;
  let tokens: FakeTokenService;
  let crypto: Sha256CryptoService;
  let ids: UuidIdGenerator;
  let clock: FixedClock;
  let useCase: AuthenticateUser;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    sessions = new InMemorySessionRepository();
    passwordHasher = new FakePasswordHasher();
    tokens = new FakeTokenService();
    crypto = new Sha256CryptoService();
    ids = new UuidIdGenerator();
    clock = new FixedClock();
    useCase = new AuthenticateUser(users, sessions, passwordHasher, tokens, crypto, ids, clock);

    await users.save(
      createUser({
        id: UserId("user-1"),
        tenantId,
        email: "owner@omnimcp.ai",
        passwordHash: await passwordHasher.hash("correct-horse"),
        role: "owner",
      }),
    );
  });

  it("issues an access + refresh token pair for valid credentials", async () => {
    const result = await useCase.execute({ tenantId, email: "owner@omnimcp.ai", password: "correct-horse" });
    expect(result.user.role).toBe("owner");
    expect(result.accessToken).toContain("owner");
    expect(sessions).toBeDefined();
  });

  it("rejects a wrong password without leaking whether the email exists", async () => {
    await expect(
      useCase.execute({ tenantId, email: "owner@omnimcp.ai", password: "wrong" }),
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      useCase.execute({ tenantId, email: "nobody@omnimcp.ai", password: "wrong" }),
    ).rejects.toThrow(InvalidCredentialsError);
  });
});

describe("IssueApiKey", () => {
  it("persists only the hash and returns the raw key once", async () => {
    const apiKeys = new InMemoryApiKeyRepository();
    const crypto = new Sha256CryptoService();
    const ids = new UuidIdGenerator();
    const clock = new FixedClock();
    const useCase = new IssueApiKey(apiKeys, crypto, ids, clock);

    const { apiKey, rawKey } = await useCase.execute({
      tenantId,
      createdByUserId: UserId("user-1"),
      name: "CI key",
    });

    expect(apiKey.keyHash).toBe(crypto.sha256(rawKey));
    expect(apiKey.keyHash).not.toBe(rawKey);
    const found = await apiKeys.findByHash(crypto.sha256(rawKey));
    expect(found?.id).toBe(apiKey.id);
  });
});
