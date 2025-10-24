import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { Request } from 'express';
import { TemplatesService } from './templates.service';

@ApiTags('tenant-templates')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenant/templates')
export class TemplatesController {
  constructor(private service: TemplatesService) {}

  @Get()
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'Lista templates con relative domande' })
  list(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.list(clientId);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crea un template' })
  create(
    @Req() req: Request,
    @Body() body: { name: string; questions?: { label: string; order?: number }[] },
  ) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.create(clientId, body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Aggiorna un template (nome e/o domande, sostituzione semplice)' })
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { name?: string; questions?: { label: string; order?: number }[] },
  ) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.update(clientId, id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Elimina un template (cascade su questions)' })
  remove(@Req() req: Request, @Param('id') id: string) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.remove(clientId, id);
  }
}

