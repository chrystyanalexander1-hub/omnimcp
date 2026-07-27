import Fastify from "fastify";
import type { AppContext, Env } from "@omnimcp/core-infrastructure";
import { registerApiKeyRoutes } from "./routes/api-keys.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerConnectorRoutes } from "./routes/connectors.js";
import { registerOAuthRoutes } from "./routes/oauth.js";
import { registerToolRoutes } from "./routes/tools.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";

export function buildServer(context: AppContext, env: Env) {
  const app = Fastify({ logger: true });

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
