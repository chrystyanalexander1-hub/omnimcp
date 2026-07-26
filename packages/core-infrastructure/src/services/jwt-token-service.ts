import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { AccessTokenClaims, TokenService } from "@omnimcp/core-application";

const ACCESS_TOKEN_TTL = "15m";

export class JwtTokenService implements TokenService {
  constructor(private readonly secret: string) {}

  issueAccessToken(claims: AccessTokenClaims): string {
    return jwt.sign(claims, this.secret, { expiresIn: ACCESS_TOKEN_TTL });
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    const decoded = jwt.verify(token, this.secret);
    if (typeof decoded !== "object" || decoded === null) {
      throw new jwt.JsonWebTokenError("Malformed token payload");
    }
    const { tenantId, userId, role } = decoded as Record<string, unknown>;
    if (typeof tenantId !== "string" || typeof userId !== "string" || typeof role !== "string") {
      throw new jwt.JsonWebTokenError("Token payload is missing required claims");
    }
    return { tenantId, userId, role };
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString("base64url");
  }
}
