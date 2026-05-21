import { Global, Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { ClaudeClientFactory } from './claude-client.factory';
import { ClaudeService } from './claude.service';
import { ClaudeCodeRunner } from './claude-code.runner';

@Global()
@Module({
  imports: [MeModule],
  providers: [ClaudeClientFactory, ClaudeCodeRunner, ClaudeService],
  exports: [ClaudeService],
})
export class ClaudeModule {}
