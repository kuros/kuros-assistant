import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskEntity } from '../entities/risk.entity';
import { RisksController } from './risks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RiskEntity])],
  controllers: [RisksController],
})
export class RisksModule {}
