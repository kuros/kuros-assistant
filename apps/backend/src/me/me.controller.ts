import { Body, Controller, Get, Patch } from '@nestjs/common';
import { MeService } from './me.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { CurrentUser } from '../common/auth/current-user.decorator';

@Controller('api/me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentUser() user: { id: string }) {
    return this.me.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: { id: string }, @Body() dto: UpdateMeDto) {
    return this.me.update(user.id, dto);
  }
}
