import { DomainError, SessionId, TenantId, type Session, type User } from "@omnimcp/core-domain";
import type { SessionRepository, UserRepository } from "../ports/repositories.js";
import type { Clock, CryptoService, IdGenerator, PasswordHasher, TokenService } from "../ports/services.js";

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super("Invalid email or password", "INVALID_CREDENTIALS");
  }
}

export interface AuthenticateUserInput {
  readonly tenantId: TenantId;
  readonly email: string;
  readonly password: string;
}

export interface AuthenticateUserOutput {
  readonly user: User;
  readonly accessToken: string;
  readonly refreshToken: string;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class AuthenticateUser {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly crypto: Pick<CryptoService, "sha256">,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: AuthenticateUserInput): Promise<AuthenticateUserOutput> {
    const user = await this.users.findByEmail(input.tenantId, input.email.trim().toLowerCase());
    if (!user) {
      throw new InvalidCredentialsError();
    }
    const valid = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    const refreshToken = this.tokens.generateRefreshToken();
    const now = this.clock.now();
    const session: Session = Object.freeze({
      id: SessionId(this.ids.newId()),
      userId: user.id,
      tenantId: user.tenantId,
      refreshTokenHash: this.crypto.sha256(refreshToken),
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      revokedAt: null,
    });
    await this.sessions.save(session);

    const accessToken = this.tokens.issueAccessToken({
      tenantId: user.tenantId,
      userId: user.id,
      role: user.role,
    });

    return { user, accessToken, refreshToken };
  }
}
