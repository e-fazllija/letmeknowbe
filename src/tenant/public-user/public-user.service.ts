import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { CreatePublicUserDto } from './dto/create-public-user.dto';
import { UpdatePublicUserDto } from './dto/update-public-user.dto';

@Injectable()
export class PublicUserService {
  constructor(private prisma: PrismaTenantService) {}

  async create(dto: CreatePublicUserDto) {
    try {
      return await this.prisma.publicUser.create({
        data: {
          clientId: dto.clientId,
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

  async findAll() {
    return this.prisma.publicUser.findMany({
      orderBy: { createdAt: 'desc' },
      include: { report: true },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.publicUser.findUnique({
      where: { id },
      include: { report: true },
    });
    if (!user) throw new NotFoundException('PublicUser non trovato');
    return user;
  }

  async update(id: string, dto: UpdatePublicUserDto) {
    try {
      // token è immutabile: rimuovilo dall'update per sicurezza
      const { token, ...safe } = (dto as any) || {};
      return await this.prisma.publicUser.update({
        where: { id },
        data: safe,
      });
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundException('PublicUser non trovato');
      throw e;
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.publicUser.delete({ where: { id } });
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundException('PublicUser non trovato');
      throw e;
    }
  }
}
