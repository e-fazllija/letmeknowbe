import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { Request } from 'express';
import { CasePolicyService } from './case-policy.service';

@ApiTags('tenant-case-policy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenant/case-policy')
export class CasePolicyController {
  constructor(private service: CasePolicyService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Recupera le policy del tenant (crea default se mancano)' })
  get(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.getOrCreate(clientId);
  }

  @Put()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Aggiorna le policy del tenant' })
  update(
    @Req() req: Request,
    @Body() body: { restrictVisibility?: boolean; allowMentions?: boolean; redactPii?: boolean; allowAttachments?: boolean },
  ) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.upsert(clientId, body);
  }
}

