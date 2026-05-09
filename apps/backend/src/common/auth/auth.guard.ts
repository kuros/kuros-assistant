import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SINGLE_USER_ID } from '@kuros/shared';

@Injectable()
export class StubAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: { id: string } }>();
    req.user = { id: SINGLE_USER_ID };
    return true;
  }
}
