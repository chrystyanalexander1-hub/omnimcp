import cors from "@fastify/cors";
import Fastify from "fastify";
import type { AppContext, Env } from "@omnimcp/core-infrastructure";
import { registerApiKeyRoutes } from "./routes/api-keys.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerConnectorRoutes } from "./routes/connectors.js";
import { registerOAuthRoutes } from "./routes/oauth.js";
import { registerToolRoutes } from "./routes/tools.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";

export async function buildServer(context: AppContext, env: Env) {
  const app = Fastify({ logger: true });

  // This API is meant to be called from OmniMCP's own web panel, from a Custom GPT's
  // Actions, and from any other tool a tenant wires up themselves — not from one
  // fixed origin — so it reflects whatever origin asked rather than allowlisting a
  // single URL. Auth is still enforced per-request via the Authorization header
  // (see auth.ts); CORS only controls which browsers are allowed to *read* the
  // response, it grants no access on its own.
  await app.register(cors, { origin: true });

  app.get("/healthz", async () => ({ status: "ok" }));

  registerAuthRoutes(app, context);
  registerApiKeyRoutes(app, context);
  registerConnectorRoutes(app, context);
  registerOAuthRoutes(app, context, env);
  registerToolRoutes(app, context);
  registerAuditRoutes(app, context);
  registerWorkflowRoutes(app, context);

  return app;
}
