import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { SummaryKind } from '@kuros/shared';

@Entity({ name: 'summaries' })
@Index('idx_summaries_user_id', ['userId'])
@Index('idx_summaries_connector_id', ['connectorId'])
@Unique('uq_summaries_period', ['userId', 'connectorId', 'targetId', 'kind', 'periodStart'])
export class SummaryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'connector_id' })
  connectorId!: string;

  @Column({ type: 'varchar', length: 128, name: 'target_id' })
  targetId!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: SummaryKind;

  @Column({ type: 'date', name: 'period_start' })
  periodStart!: string;

  @Column({ type: 'date', name: 'period_end' })
  periodEnd!: string;

  @Column({ type: 'text', name: 'file_path' })
  filePath!: string;

  @Column({ type: 'integer', name: 'item_count' })
  itemCount!: number;

  @Column({ type: 'varchar', length: 64, name: 'model_used' })
  modelUsed!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
