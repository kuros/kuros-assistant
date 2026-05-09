import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TeamEntity } from '../entities/team.entity';
import { TeamMemberEntity } from '../entities/team-member.entity';
import type { TeamDto } from '@kuros/shared';
import { CurrentUser, AuthenticatedUser } from '../common/auth/current-user.decorator';
import { ArrayUnique, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

class CreateTeamDto {
  @IsString() @MaxLength(120) name!: string;
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) memberIds!: string[];
}

class UpdateTeamDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) memberIds?: string[];
}

@Controller('api/teams')
export class TeamsController {
  constructor(
    @InjectRepository(TeamEntity) private readonly teams: Repository<TeamEntity>,
    @InjectRepository(TeamMemberEntity) private readonly members: Repository<TeamMemberEntity>,
    private readonly ds: DataSource,
  ) {}

  private async toDto(e: TeamEntity): Promise<TeamDto> {
    const ms = await this.members.find({ where: { teamId: e.id } });
    return {
      id: e.id,
      name: e.name,
      memberIds: ms.map((m) => m.personId),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<TeamDto[]> {
    const rows = await this.teams.find({ where: { userId: user.id }, order: { name: 'ASC' } });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTeamDto,
  ): Promise<TeamDto> {
    return this.ds.transaction(async (mgr) => {
      const team = await mgr.save(mgr.create(TeamEntity, { userId: user.id, name: dto.name }));
      if (dto.memberIds.length > 0) {
        await mgr.insert(
          TeamMemberEntity,
          dto.memberIds.map((personId) => ({ teamId: team.id, personId })),
        );
      }
      return this.toDto(team);
    });
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<TeamDto> {
    return this.ds.transaction(async (mgr) => {
      const team = await mgr.findOneOrFail(TeamEntity, { where: { id, userId: user.id } });
      if (dto.name !== undefined) team.name = dto.name;
      const saved = await mgr.save(team);
      if (dto.memberIds !== undefined) {
        await mgr.delete(TeamMemberEntity, { teamId: id });
        if (dto.memberIds.length > 0) {
          await mgr.insert(
            TeamMemberEntity,
            dto.memberIds.map((personId) => ({ teamId: id, personId })),
          );
        }
      }
      return this.toDto(saved);
    });
  }
}
