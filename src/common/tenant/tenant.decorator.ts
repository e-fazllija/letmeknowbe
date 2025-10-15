import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const TenantId = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return (req as any).tenantId as string | undefined;
});

