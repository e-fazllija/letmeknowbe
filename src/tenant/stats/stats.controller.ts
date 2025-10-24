import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { Request } from 'express';
import { StatsService } from './stats.service';

@ApiTags('tenant-stats')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenant/stats')
export class StatsController {
  constructor(private service: StatsService) {}

  @Get()
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'Statistiche tenant per dashboard Admin/Impostazioni' })
  getStats(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.getStats(clientId);
  }
}

