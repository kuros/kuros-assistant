import { Injectable, NotFoundException } from '@nestjs/common';
import type { ConnectorKind } from '@kuros/shared';
import { Connector } from './connector.interface';

@Injectable()
export class ConnectorRegistry {
  private readonly connectors = new Map<ConnectorKind, Connector>();

  register(connector: Connector): void {
    this.connectors.set(connector.kind, connector);
  }

  get(kind: ConnectorKind): Connector {
    const c = this.connectors.get(kind);
    if (!c) throw new NotFoundException(`Connector kind not registered: ${kind}`);
    return c;
  }

  has(kind: ConnectorKind): boolean {
    return this.connectors.has(kind);
  }

  kinds(): ConnectorKind[] {
    return Array.from(this.connectors.keys());
  }
}
