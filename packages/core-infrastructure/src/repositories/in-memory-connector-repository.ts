import type { Connector, ConnectorId } from "@omnimcp/core-domain";
import type { ConnectorRepository } from "@omnimcp/core-application";

/**
 * The connector catalog is rebuilt from `connector.manifest.json` files by
 * RegisterConnector on every gateway boot, so it doesn't need durable storage in a
 * single-instance deployment. Swap this for a Postgres-backed implementation once the
 * gateway runs as multiple replicas that need a shared, consistent catalog.
 */
export class InMemoryConnectorRepository implements ConnectorRepository {
  private readonly rows = new Map<string, Connector>();

  async findById(id: ConnectorId): Promise<Connector | null> {
    return this.rows.get(id) ?? null;
  }

  async list(): Promise<Connector[]> {
    return [...this.rows.values()];
  }

  async save(connector: Connector): Promise<void> {
    this.rows.set(connector.id, connector);
  }
}
