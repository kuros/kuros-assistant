import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ConnectorKind, ConnectorStatus } from '@kuros/shared';

@Entity({ name: 'connectors' })
@Index('idx_connectors_user_id', ['userId'])
export class ConnectorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: ConnectorKind;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'jsonb' })
  config!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: ConnectorStatus;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
