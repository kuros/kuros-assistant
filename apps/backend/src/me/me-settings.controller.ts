import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UserSettingsService } from './user-settings.service';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { CurrentUser } from '../common/auth/current-user.decorator';

@Controller('api/me/settings')
export class MeSettingsController {
  constructor(private readonly userSettings: UserSettingsService) {}

  @Get()
  get(@CurrentUser() user: { id: string }) {
    return this.userSettings.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: { id: string }, @Body() dto: UpdateUserSettingsDto) {
    return this.userSettings.update(user.id, dto);
  }
}
