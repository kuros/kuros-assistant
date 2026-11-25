import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { SummaryKind, WikiIngestionStatus } from '@kuros/shared';

/** Tracks which generated summaries have been folded into the user's LLM wiki. */
@Entity({ name: 'wiki_ingestions' })
@Index('idx_wiki_ingestions_user_status', ['userId', 'status'])
@Unique('uq_wiki_ingestions_summary', ['userId', 'summaryId'])
export class WikiIngestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'summary_id' })
  summaryId!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: SummaryKind;

  /** The day for daily summaries, the week's last day for weekly ones. Drives ingest order. */
  @Column({ type: 'date', name: 'period_date' })
  periodDate!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: WikiIngestionStatus;

  @Column({ type: 'text', name: 'source_label', nullable: true })
  sourceLabel!: string | null;

  @Column({ type: 'text', name: 'source_page', nullable: true })
  sourcePage!: string | null;

  @Column({ type: 'jsonb', name: 'pages_touched', default: () => `'[]'::jsonb` })
  pagesTouched!: string[];

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'finished_at', nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
