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
   * - Crea Subscription nel PUBLIC (schema aggiornato)
   * - Replica "shadow" nel TENANT (stesso id e piano)
   */
  async create(dto: CreateSubscriptionDto) {
    try {
      const plan = await this.prismaPublic.subscriptionPlan.findUnique({ where: { id: dto.subscriptionPlanId } });
      if (!plan) throw new BadRequestException('subscriptionPlanId non valido');

      const publicSub = await this.prismaPublic.subscription.create({
        data: {
          client: { connect: { id: dto.clientId } },
          plan: { connect: { id: plan.id } },
          amount: new PublicPrisma.Decimal(dto.amount),
          currency: dto.currency ?? 'EUR',
          contractTerm: dto.contractTerm,
          installmentPlan: dto.installmentPlan,
          status: dto.status ?? SubscriptionStatus.ACTIVE,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          nextBillingAt: dto.nextBillingAt ? new Date(dto.nextBillingAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
      });

      // Replica/Upsert piano nel TENANT
      await this.prismaTenant.subscriptionPlan.upsert({
        where: { id: plan.id },
        update: { name: plan.name, description: plan.description ?? undefined, price: plan.price as any, currency: plan.currency, billingCycle: plan.billingCycle as any, active: plan.active },
        create: { id: plan.id, name: plan.name, description: plan.description ?? undefined, price: plan.price as any, currency: plan.currency, billingCycle: plan.billingCycle as any, active: plan.active },
      });

      await this.prismaTenant.subscription.create({
        data: {
          id: publicSub.id,
          clientId: dto.clientId,
          subscriptionPlanId: plan.id,
          amount: publicSub.amount as any,
          currency: publicSub.currency,
          contractTerm: publicSub.contractTerm,
          installmentPlan: publicSub.installmentPlan as any,
          status: publicSub.status as any,
          startsAt: publicSub.startsAt,
          nextBillingAt: publicSub.nextBillingAt ?? undefined,
          endsAt: publicSub.endsAt ?? undefined,
        },
      });

      return publicSub;
    } catch (e: any) {
      if (e?.code === 'P2003') {
        throw new BadRequestException('clientId o subscriptionPlanId non valido');
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
    if (dto.subscriptionPlanId) data.plan = { connect: { id: dto.subscriptionPlanId } };
    if (dto.amount !== undefined) data.amount = new PublicPrisma.Decimal(dto.amount);
    if (dto.currency) data.currency = dto.currency;
    if (dto.contractTerm) data.contractTerm = dto.contractTerm;
    if (dto.installmentPlan) data.installmentPlan = dto.installmentPlan;
    if (dto.status) data.status = dto.status;
    if (dto.startsAt) data.startsAt = new Date(dto.startsAt);
    if (dto.nextBillingAt) data.nextBillingAt = new Date(dto.nextBillingAt);
    if (dto.endsAt) data.endsAt = new Date(dto.endsAt);

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
          subscriptionPlanId: updated.subscriptionPlanId,
          amount: updated.amount as any,
          currency: updated.currency,
          contractTerm: updated.contractTerm,
          installmentPlan: updated.installmentPlan as any,
          status: updated.status as any,
          startsAt: updated.startsAt,
          nextBillingAt: updated.nextBillingAt ?? undefined,
          endsAt: updated.endsAt ?? undefined,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2025') {
        await this.prismaTenant.subscription.create({
          data: {
            id: updated.id,
            clientId: updated.clientId,
            subscriptionPlanId: updated.subscriptionPlanId,
            amount: updated.amount as any,
            currency: updated.currency,
            contractTerm: updated.contractTerm,
            installmentPlan: updated.installmentPlan as any,
            status: updated.status as any,
            startsAt: updated.startsAt,
            nextBillingAt: updated.nextBillingAt ?? undefined,
            endsAt: updated.endsAt ?? undefined,
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
