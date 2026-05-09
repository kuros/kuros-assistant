import { Global, Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { ClaudeClientFactory } from './claude-client.factory';
import { ClaudeService } from './claude.service';

@Global()
@Module({
  imports: [MeModule],
  providers: [ClaudeClientFactory, ClaudeService],
  exports: [ClaudeService],
})
export class ClaudeModule {}
