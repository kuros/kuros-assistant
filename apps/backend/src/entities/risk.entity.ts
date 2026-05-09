import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { RiskSeverity, RiskStatus } from '@kuros/shared';

@Entity({ schema: 'kuros_manager', name: 'risks' })
@Index('idx_risks_user_id', ['userId'])
export class RiskEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'source_summary_id', nullable: true })
  sourceSummaryId!: string | null;

  @Column({ type: 'varchar', length: 512 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  detail!: string | null;

  @Column({ type: 'varchar', length: 16 })
  severity!: RiskSeverity;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: RiskStatus;

  @Column({ type: 'text', name: 'file_path', nullable: true })
  filePath!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
