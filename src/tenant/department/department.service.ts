import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentService {
  constructor(private prisma: PrismaTenantService) {}

  findAll(clientId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    return this.prisma.department.findMany({
      where: { clientId, active: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(clientId: string, dto: CreateDepartmentDto) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const dep = await this.prisma.department.create({
      data: { clientId, name: dto.name, active: true },
      select: { id: true, name: true },
    });
    return dep;
  }

  async update(clientId: string, id: string, dto: UpdateDepartmentDto) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const exists = await this.prisma.department.findFirst({ where: { id, clientId } });
    if (!exists) throw new NotFoundException('Reparto non trovato');
    return this.prisma.department.update({ where: { id }, data: { name: dto.name ?? exists.name }, select: { id: true, name: true } });
  }

  async softDelete(clientId: string, id: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const exists = await this.prisma.department.findFirst({ where: { id, clientId } });
    if (!exists) throw new NotFoundException('Reparto non trovato');
    await this.prisma.department.update({ where: { id }, data: { active: false } });
    return;
  }
}

