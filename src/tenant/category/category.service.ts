import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaTenantService) {}

  findAll(clientId: string, departmentId?: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    return this.prisma.category.findMany({
      where: { clientId, active: true, ...(departmentId ? { departmentId } : {}) },
      select: { id: true, name: true, departmentId: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(clientId: string, dto: CreateCategoryDto) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    // verify department belongs to tenant
    const dep = await this.prisma.department.findFirst({ where: { id: dto.departmentId, clientId, active: true }, select: { id: true } });
    if (!dep) throw new NotFoundException('Reparto non trovato');
    return this.prisma.category.create({ data: { clientId, departmentId: dto.departmentId, name: dto.name, active: true }, select: { id: true, name: true, departmentId: true } });
  }

  async update(clientId: string, id: string, dto: UpdateCategoryDto) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const cat = await this.prisma.category.findFirst({ where: { id, clientId } });
    if (!cat) throw new NotFoundException('Categoria non trovata');
    if (dto.departmentId) {
      const dep = await this.prisma.department.findFirst({ where: { id: dto.departmentId, clientId, active: true }, select: { id: true } });
      if (!dep) throw new NotFoundException('Reparto non trovato');
    }
    return this.prisma.category.update({ where: { id }, data: { name: dto.name ?? cat.name, departmentId: dto.departmentId ?? cat.departmentId }, select: { id: true, name: true, departmentId: true } });
  }

  async softDelete(clientId: string, id: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const cat = await this.prisma.category.findFirst({ where: { id, clientId } });
    if (!cat) throw new NotFoundException('Categoria non trovata');
    await this.prisma.category.update({ where: { id }, data: { active: false } });
    return;
  }
}

