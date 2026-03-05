import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { CreatePublicUserDto } from './dto/create-public-user.dto';
import { UpdatePublicUserDto } from './dto/update-public-user.dto';

@Injectable()
export class PublicUserService {
  constructor(private prisma: PrismaTenantService) {}

  async createForClient(clientId: string, dto: CreatePublicUserDto) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    try {
      return await this.prisma.publicUser.create({
        data: {
          clientId,
          reportId: dto.reportId,
          token: dto.token, // token univoco (hash o uuid)
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('Token già esistente');
      }
      throw e;
    }
  }

  async findAllByClient(clientId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    return this.prisma.publicUser.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include: { report: true },
    });
  }

  async findOneByClient(clientId: string, id: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const user = await this.prisma.publicUser.findFirst({
      where: { id, clientId },
      include: { report: true },
    });
    if (!user) throw new NotFoundException('PublicUser non trovato');
    return user;
  }

  async updateByClient(clientId: string, id: string, dto: UpdatePublicUserDto) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    try {
      // token è immutabile: rimuovilo dall'update per sicurezza
      const { token, ...safe } = (dto as any) || {};
      const exists = await this.prisma.publicUser.findFirst({ where: { id, clientId } });
      if (!exists) throw new NotFoundException('PublicUser non trovato');
      return await this.prisma.publicUser.update({ where: { id }, data: safe });
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundException('PublicUser non trovato');
      throw e;
    }
  }

  async removeByClient(clientId: string, id: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    try {
      const exists = await this.prisma.publicUser.findFirst({ where: { id, clientId } });
      if (!exists) throw new NotFoundException('PublicUser non trovato');
      return await this.prisma.publicUser.delete({ where: { id } });
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundException('PublicUser non trovato');
      throw e;
    }
  }
}
