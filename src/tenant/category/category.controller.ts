import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { Request } from 'express';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('tenant-categories')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenant/categories')
export class CategoryController {
  constructor(private service: CategoryService) {}

  @Get()
  @Roles('ADMIN', 'AGENT')
  @ApiOperation({ summary: 'Lista categorie (tenant-scoped)' })
  @ApiQuery({ name: 'departmentId', required: false })
  findAll(@Req() req: Request, @Query('departmentId') departmentId?: string) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.findAll(clientId, departmentId);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crea categoria' })
  create(@Req() req: Request, @Body() dto: CreateCategoryDto) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.create(clientId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Aggiorna categoria' })
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.update(clientId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Disattiva categoria (soft delete)' })
  remove(@Req() req: Request, @Param('id') id: string) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.softDelete(clientId, id);
  }
}

