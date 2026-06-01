import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { UserEntity } from './user.entity';

export type AiProvider = 'api' | 'claude_code';
export type ClaudeEffort = 'low' | 'medium' | 'high';

@Entity({ name: 'user_settings' })
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

  @Column({ type: 'text', name: 'claude_effort_fast', nullable: true })
  claudeEffortFast!: ClaudeEffort | null;

  @Column({ type: 'text', name: 'claude_effort_deep', nullable: true })
  claudeEffortDeep!: ClaudeEffort | null;

  @Column({ type: 'text', name: 'ai_provider', default: 'api' })
  aiProvider!: AiProvider;
}
