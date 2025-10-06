import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaPublicService } from '../prisma-public.service';
import { PrismaTenantService } from './../../tenant/prisma-tenant.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { Prisma } from '../../generated/public';

@Injectable()
export class SubscriptionService {
  constructor(
    private prismaPublic: PrismaPublicService,
    private prismaTenant: PrismaTenantService,
  ) {}

  async create(dto: CreateSubscriptionDto) {
    const data = {
      clientId: dto.clientId,
      amount: new Prisma.Decimal(dto.amount),
      currency: dto.currency ?? 'EUR',
      plan: dto.plan,
      method: dto.method,
      status: dto.status ?? 'SUCCESS',
    };

    try {
      // ✅ 1️⃣ Crea nel DB pubblico
      const publicSub = await this.prismaPublic.subscription.create({ data });

      // ✅ 2️⃣ Replica nel DB tenant
      await this.prismaTenant.subscription.create({ data });

      return publicSub;
    } catch (e: any) {
      if (e?.code === 'P2003') {
        throw new BadRequestException('clientId non valido');
      }
      throw e;
    }
  }

  async findAll() {
    return this.prismaPublic.subscription.findMany({
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const sub = await this.prismaPublic.subscription.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!sub) throw new NotFoundException('Subscription non trovata');
    return sub;
  }

  async update(id: string, dto: UpdateSubscriptionDto) {
    if (!id) throw new BadRequestException('Missing subscription id in path');

    const data: any = { ...dto };
    if (dto.amount !== undefined) {
      data.amount = new Prisma.Decimal(dto.amount);
    }

    try {
      // ✅ aggiorna in entrambi i DB
      const updated = await this.prismaPublic.subscription.update({
        where: { id },
        data,
      });

      await this.prismaTenant.subscription.update({
        where: { id },
        data,
      });

      return updated;
    } catch (e: any) {
      if (e?.code === 'P2025') {
        throw new NotFoundException('Subscription non trovata');
      }
      if (e?.code === 'P2003') {
        throw new BadRequestException('FK non valida');
      }
      throw e;
    }
  }

  async remove(id: string) {
    try {
      // ✅ elimina in entrambi i DB
      await this.prismaTenant.subscription.delete({ where: { id } });
      return await this.prismaPublic.subscription.delete({ where: { id } });
    } catch (e: any) {
      if (e?.code === 'P2025') {
        throw new NotFoundException('Subscription non trovata');
      }
      throw e;
    }
  }
}
