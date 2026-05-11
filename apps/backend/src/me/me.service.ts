import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import type { MeDto } from '@kuros/shared';
import { UpdateMeDto } from './dto/update-me.dto';

@Injectable()
export class MeService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  private toDto(u: UserEntity): MeDto {
    return {
      id: u.id,
      email: u.email,
      timezone: u.timezone,
      name: u.name,
      onboarded: u.onboarded,
    };
  }

  async get(userId: string): Promise<MeDto> {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');
    return this.toDto(u);
  }

  async update(userId: string, dto: UpdateMeDto): Promise<MeDto> {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');

    if (dto.timezone != null) {
      try {
        // Validate IANA timezone name (Node 20+ supports this)
        Intl.DateTimeFormat(undefined, { timeZone: dto.timezone });
      } catch {
        throw new BadRequestException(`Invalid timezone: ${dto.timezone}`);
      }
      u.timezone = dto.timezone;
    }

    if (dto.email != null) u.email = dto.email;
    if (dto.name != null) u.name = dto.name;

    await this.users.save(u);
    return this.toDto(u);
  }
}
