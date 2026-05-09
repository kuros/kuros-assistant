import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionItemEntity } from '../entities/action-item.entity';
import { ActionItemsController } from './action-items.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ActionItemEntity])],
  controllers: [ActionItemsController],
})
export class ActionItemsModule {}
