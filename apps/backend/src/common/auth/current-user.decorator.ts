import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SINGLE_USER_ID } from '@kuros/shared';

export interface AuthenticatedUser {
  id: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return req.user ?? { id: SINGLE_USER_ID };
  },
);
