import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserSettingsEntity } from '../entities/user-settings.entity';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { MeSettingsController } from './me-settings.controller';
import { UserSettingsService } from './user-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserSettingsEntity])],
  controllers: [MeController, MeSettingsController],
  providers: [MeService, UserSettingsService],
  exports: [MeService, UserSettingsService],
})
export class MeModule {}
