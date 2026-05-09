import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { InsightScope } from '@kuros/shared';

@Entity({ schema: 'kuros_manager', name: 'insights' })
@Index('idx_insights_user_id', ['userId'])
@Unique('uq_insights_scope_period', ['userId', 'scope', 'scopeRef', 'periodStart', 'periodEnd'])
export class InsightEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  scope!: InsightScope;

  @Column({ type: 'varchar', length: 128, name: 'scope_ref' })
  scopeRef!: string;

  @Column({ type: 'date', name: 'period_start' })
  periodStart!: string;

  @Column({ type: 'date', name: 'period_end' })
  periodEnd!: string;

  @Column({ type: 'text', name: 'file_path' })
  filePath!: string;

  @Column({ type: 'varchar', length: 64, name: 'model_used' })
  modelUsed!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
