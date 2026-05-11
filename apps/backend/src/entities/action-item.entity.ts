import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ActionItemStatus } from '@kuros/shared';

@Entity({ name: 'action_items' })
@Index('idx_action_items_user_id', ['userId'])
export class ActionItemEntity {
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

  @Column({ type: 'date', name: 'due_date', nullable: true })
  dueDate!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: ActionItemStatus;

  @Column({ type: 'text', name: 'file_path', nullable: true })
  filePath!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
