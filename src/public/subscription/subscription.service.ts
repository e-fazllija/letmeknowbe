import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaPublicService } from '../prisma-public.service';
import { PrismaTenantService } from './../../tenant/prisma-tenant.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

// come sopra: tipi dal namespace, enum runtime top-level
import {
  Prisma as PublicPrisma,
  SubscriptionStatus,
} from '../../generated/public';

@Injectable()
export class SubscriptionService {
  constructor(
    private prismaPublic: PrismaPublicService,
    private prismaTenant: PrismaTenantService,
  ) {}

  /**
   * CREATE
   * - Crea Subscription nel PUBLIC
   * - Replica "shadow" nel TENANT (senza amount/currency/method)
   */
  async create(dto: CreateSubscriptionDto) {
    const data: PublicPrisma.SubscriptionCreateInput = {
      client: { connect: { id: dto.clientId } },
      amount: new PublicPrisma.Decimal(dto.amount),
      currency: dto.currency ?? 'EUR',
      billingCycle: dto.billingCycle,
      contractTerm: dto.contractTerm,
      method: dto.paymentMethod,
      status: dto.status ?? SubscriptionStatus.ACTIVE, // runtime enum

      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      nextBillingAt: dto.nextBillingAt ? new Date(dto.nextBillingAt) : undefined,
      trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined,
      canceledAt: dto.canceledAt ? new Date(dto.canceledAt) : undefined,
    };

    try {
      const publicSub = await this.prismaPublic.subscription.create({ data });

      // Replica nel TENANT (shadow)
      await this.prismaTenant.subscription.create({
        data: {
          id: publicSub.id,
          clientId: dto.clientId,
          billingCycle: publicSub.billingCycle,
          contractTerm: publicSub.contractTerm,
          status: publicSub.status as any,
          startsAt: publicSub.startsAt,
          nextBillingAt: publicSub.nextBillingAt ?? undefined,
        },
      });

      return publicSub;
    } catch (e: any) {
      if (e?.code === 'P2003') {
        throw new BadRequestException('clientId non valido');
      }
      throw e;
    }
  }

  /**
   * FIND ALL
   */
  async findAll() {
    return this.prismaPublic.subscription.findMany({
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * FIND ONE
   */
  async findOne(id: string) {
    if (!id) throw new BadRequestException('Missing subscription id in path');
    const sub = await this.prismaPublic.subscription.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!sub) throw new NotFoundException('Subscription non trovata');
    return sub;
  }

  /**
   * UPDATE
   * - Aggiorna nel PUBLIC
   * - Upsert nel TENANT (shadow)
   */
  async update(id: string, dto: UpdateSubscriptionDto) {
    if (!id) throw new BadRequestException('Missing subscription id in path');

    const current = await this.prismaPublic.subscription.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Subscription non trovata');

    const data: PublicPrisma.SubscriptionUpdateInput = {};
    if (dto.clientId) data.client = { connect: { id: dto.clientId } };
    if (dto.amount !== undefined) data.amount = new PublicPrisma.Decimal(dto.amount);
    if (dto.currency) data.currency = dto.currency;
    if (dto.billingCycle) data.billingCycle = dto.billingCycle;
    if (dto.contractTerm) data.contractTerm = dto.contractTerm;
    if (dto.paymentMethod) data.method = dto.paymentMethod;
    if (dto.status) data.status = dto.status;
    if (dto.startsAt) data.startsAt = new Date(dto.startsAt);
    if (dto.nextBillingAt) data.nextBillingAt = new Date(dto.nextBillingAt);
    if (dto.trialEndsAt) data.trialEndsAt = new Date(dto.trialEndsAt);
    if (dto.canceledAt) data.canceledAt = new Date(dto.canceledAt);

    const updated = await this.prismaPublic.subscription.update({
      where: { id },
      data,
    });

    // Replica/Upsert nel TENANT (shadow)
    try {
      await this.prismaTenant.subscription.update({
        where: { id },
        data: {
          clientId: updated.clientId,
          billingCycle: updated.billingCycle,
          contractTerm: updated.contractTerm,
          status: updated.status as any,
          startsAt: updated.startsAt,
          nextBillingAt: updated.nextBillingAt ?? undefined,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2025') {
        await this.prismaTenant.subscription.create({
          data: {
            id: updated.id,
            clientId: updated.clientId,
            billingCycle: updated.billingCycle,
            contractTerm: updated.contractTerm,
            status: updated.status as any,
            startsAt: updated.startsAt,
            nextBillingAt: updated.nextBillingAt ?? undefined,
          },
        });
      } else {
        throw e;
      }
    }

    return updated;
  }

  /**
   * DELETE
   * - Cancella public
   * - Cancella tenant (se esiste; ignora P2025)
   */
  async remove(id: string) {
    if (!id) throw new BadRequestException('Missing subscription id in path');

    const existing = await this.prismaPublic.subscription.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Subscription non trovata');

    const deleted = await this.prismaPublic.subscription.delete({
      where: { id },
    });

    try {
      await this.prismaTenant.subscription.delete({ where: { id } });
    } catch (e: any) {
      if (e?.code !== 'P2025') throw e;
    }

    return deleted;
  }
}
