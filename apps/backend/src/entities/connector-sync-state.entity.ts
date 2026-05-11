import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'connector_sync_state' })
export class ConnectorSyncStateEntity {
  @PrimaryColumn({ type: 'uuid', name: 'connector_id' })
  connectorId!: string;

  @PrimaryColumn({ type: 'varchar', length: 128, name: 'target_id' })
  targetId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cursor!: string | null;

  @Column({ type: 'timestamptz', name: 'last_run_at', nullable: true })
  lastRunAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'last_item_at', nullable: true })
  lastItemAt!: Date | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
