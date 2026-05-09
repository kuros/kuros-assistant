import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonEntity } from '../entities/person.entity';
import { TeamEntity } from '../entities/team.entity';
import { TeamMemberEntity } from '../entities/team-member.entity';
import { PeopleController } from './people.controller';
import { TeamsController } from './teams.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PersonEntity, TeamEntity, TeamMemberEntity])],
  controllers: [PeopleController, TeamsController],
})
export class PeopleTeamsModule {}
