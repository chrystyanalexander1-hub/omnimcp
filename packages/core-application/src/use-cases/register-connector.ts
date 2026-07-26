import { ConnectorId, createConnector, type Connector, type ConnectorAuth, type ConnectorTransport, type Tool } from "@omnimcp/core-domain";
import type { ConnectorRepository } from "../ports/repositories.js";

/** Shape of a parsed connector.manifest.json, validated by the caller (gateway boot) before reaching this use case. */
export interface ConnectorManifest {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly transport: ConnectorTransport;
  readonly auth: ConnectorAuth;
  readonly tools: readonly Tool[];
}

export class RegisterConnector {
  constructor(private readonly connectors: ConnectorRepository) {}

  async execute(manifest: ConnectorManifest): Promise<Connector> {
    const connector = createConnector({
      id: ConnectorId(manifest.id),
      displayName: manifest.displayName,
      version: manifest.version,
      transport: manifest.transport,
      auth: manifest.auth,
      tools: manifest.tools,
    });
    await this.connectors.save(connector);
    return connector;
  }
}
