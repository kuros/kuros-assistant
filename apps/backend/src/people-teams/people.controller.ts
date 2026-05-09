import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PersonEntity } from '../entities/person.entity';
import type { PersonDto } from '@kuros/shared';
import { CurrentUser, AuthenticatedUser } from '../common/auth/current-user.decorator';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

class CreatePersonDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() slackUserId?: string | null;
  @IsOptional() @IsEmail() outlookAddress?: string | null;
  @IsOptional() @IsString() role?: string | null;
}

class UpdatePersonDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() slackUserId?: string | null;
  @IsOptional() @IsEmail() outlookAddress?: string | null;
  @IsOptional() @IsString() role?: string | null;
}

@Controller('api/people')
export class PeopleController {
  constructor(@InjectRepository(PersonEntity) private readonly repo: Repository<PersonEntity>) {}

  private toDto(e: PersonEntity): PersonDto {
    return {
      id: e.id,
      name: e.name,
      email: e.email,
      slackUserId: e.slackUserId,
      outlookAddress: e.outlookAddress,
      role: e.role,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<PersonDto[]> {
    const rows = await this.repo.find({ where: { userId: user.id }, order: { name: 'ASC' } });
    return rows.map((r) => this.toDto(r));
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePersonDto,
  ): Promise<PersonDto> {
    const row = this.repo.create({
      userId: user.id,
      name: dto.name,
      email: dto.email ?? null,
      slackUserId: dto.slackUserId ?? null,
      outlookAddress: dto.outlookAddress ?? null,
      role: dto.role ?? null,
    });
    return this.toDto(await this.repo.save(row));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePersonDto,
  ): Promise<PersonDto> {
    const row = await this.repo.findOneOrFail({ where: { id, userId: user.id } });
    Object.assign(row, dto);
    return this.toDto(await this.repo.save(row));
  }
}
