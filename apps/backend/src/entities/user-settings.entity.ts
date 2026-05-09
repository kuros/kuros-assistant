import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { UserEntity } from './user.entity';

@Entity({ schema: 'kuros_manager', name: 'user_settings' })
export class UserSettingsEntity {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text', name: 'anthropic_api_key', nullable: true })
  anthropicApiKey!: string | null;

  @Column({ type: 'text', name: 'claude_model_fast', nullable: true })
  claudeModelFast!: string | null;

  @Column({ type: 'text', name: 'claude_model_deep', nullable: true })
  claudeModelDeep!: string | null;
}
