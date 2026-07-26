import type { FastifyReply } from "fastify";
import { DomainError } from "@omnimcp/core-domain";
import { ZodError } from "zod";

const STATUS_BY_CODE: Record<string, number> = {
  INVALID_CREDENTIALS: 401,
  PERMISSION_DENIED: 403,
  CONFIRMATION_REQUIRED: 428, // Precondition Required — resubmit with explicit confirmation
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INVALID_ENTITY: 400,
};

export function sendError(reply: FastifyReply, err: unknown): void {
  if (err instanceof ZodError) {
    reply.code(400).send({ error: "Invalid request body", details: err.issues });
    return;
  }
  if (err instanceof DomainError) {
    reply.code(STATUS_BY_CODE[err.code] ?? 400).send({ error: err.message, code: err.code });
    return;
  }
  reply.log.error(err);
  reply.code(500).send({ error: "Internal server error" });
}
