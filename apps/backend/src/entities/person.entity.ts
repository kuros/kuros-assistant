import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'people' })
@Index('idx_people_user_id', ['userId'])
export class PersonEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 64, name: 'slack_user_id', nullable: true })
  slackUserId!: string | null;

  @Column({ type: 'varchar', length: 320, name: 'outlook_address', nullable: true })
  outlookAddress!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  role!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
