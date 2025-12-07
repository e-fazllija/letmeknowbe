import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ActiveClientGuard } from '../../common/guards/active-client.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { Request } from 'express';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@ApiTags('tenant-departments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ActiveClientGuard, RolesGuard)
@Controller('tenant/departments')
export class DepartmentController {
  constructor(private service: DepartmentService) {}

  @Get()
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'Lista reparti (tenant-scoped)' })
  findAll(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.findAll(clientId);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crea reparto' })
  create(@Req() req: Request, @Body() dto: CreateDepartmentDto) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.create(clientId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Aggiorna reparto' })
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.update(clientId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Disattiva reparto (soft delete)' })
  remove(@Req() req: Request, @Param('id') id: string) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.softDelete(clientId, id);
  }
}

