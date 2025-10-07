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
      //  Crea nel DB pubblico
      const publicSub = await this.prismaPublic.subscription.create({ data });

      //  Replica nel DB tenant
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
    if (!id) throw new BadRequestException('Missing subscription id in path');
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
  if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);

  const current = await this.prismaPublic.subscription.findUnique({ where: { id } });
  if (!current) throw new NotFoundException('Subscription non trovata');

  const updated = await this.prismaPublic.subscription.update({ where: { id }, data });

  try {
    await this.prismaTenant.subscription.update({ where: { id }, data });
  } catch (e: any) {
    if (e?.code === 'P2025') {
      await this.prismaTenant.subscription.create({
        data: {
          id: current.id, // solo se in schema consenti set esplicito dell'id
          clientId: current.clientId,
          amount: updated.amount,
          currency: updated.currency,
          plan: updated.plan,
          method: updated.method,
          status: updated.status,
          createdAt: current.createdAt,
        },
      });
    } else {
      throw e;
    }
  }

  return updated;
}


  async remove(id: string) {
  if (!id) throw new BadRequestException('Missing subscription id in path');

  const existing = await this.prismaPublic.subscription.findUnique({ where: { id } });
  if (!existing) throw new NotFoundException('Subscription non trovata');

  const deleted = await this.prismaPublic.subscription.delete({ where: { id } });

  try {
    await this.prismaTenant.subscription.delete({ where: { id } });
  } catch (e: any) {
    if (e?.code !== 'P2025') throw e; // se non esiste nel tenant, pazienza (logga)
  }

  return deleted;
}
}
 