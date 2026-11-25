import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { ChatRole } from '@kuros/shared';

@Entity({ name: 'chat_messages' })
@Index('idx_chat_messages_conversation', ['conversationId', 'createdAt'])
export class ChatMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'conversation_id' })
  conversationId!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: ChatRole;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  citations!: string[];

  @Column({ type: 'text', name: 'filed_to', nullable: true })
  filedTo!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
