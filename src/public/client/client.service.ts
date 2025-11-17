import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaPublicService } from '../prisma-public.service';
import { PrismaTenantService } from './../../tenant/prisma-tenant.service';

//  Import robusto dal client generato:
// - PublicPrisma = namespace con i TIPI (PublicPrisma.ClientStatus, .Decimal, …)
// - Enum runtime separati (ClientStatus, SubscriptionStatus, …) per i VALORI
import {
  Prisma as PublicPrisma,
  ClientStatus,
  SubscriptionStatus,
  InstallmentPlan,
} from '../../generated/public';
import * as crypto from 'crypto';

import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { SignupClientDto } from './dto/signup-client.dto';

@Injectable()
export class ClientService {
  constructor(
    private publicPrisma: PrismaPublicService,
    private tenantPrisma: PrismaTenantService,
  ) {}

  /**
   * SIGNUP ORCHESTRATO (azienda)
   * - Crea Client (PUBLIC) + Subscription (PUBLIC)
   * - Replica Client e Subscription "shadow" (TENANT)
   * - Compensa in caso di errori di replica
   */
  async signupOrchestrated(dto: SignupClientDto) {
    // 1) Crea Client nel PUBLIC
    const clientData: PublicPrisma.ClientCreateInput = {
      companyName: dto.client.companyName,
      contactEmail: dto.client.contactEmail,
      employeeRange: dto.client.employeeRange,
      status: dto.client.status ?? ClientStatus.ACTIVE, //  runtime enum

      // Billing (fonte di verità in PUBLIC)
      billingTaxId: dto.client.billing.billingTaxId,
      billingEmail: dto.client.billing.billingEmail,
      billingPec: dto.client.billing.billingPec,
      billingSdiCode: dto.client.billing.billingSdiCode,
      billingAddressLine1: dto.client.billing.billingAddressLine1,
      billingZip: dto.client.billing.billingZip,
      billingCity: dto.client.billing.billingCity,
      billingProvince: dto.client.billing.billingProvince,
      billingCountry: dto.client.billing.billingCountry,
    };

    let createdClient: { id: string } | null = null;
    let createdSub: { id: string } | null = null;

    try {
      createdClient = await this.publicPrisma.client.create({ data: clientData });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        // Unique (email o billingTaxId)
        throw new ConflictException('Azienda già esistente (email o P.IVA/CF).');
      }
      throw e;
    }

    try {
      // 2) Assicurati che esista un SubscriptionPlan (usa quello passato dal DTO)
      const plan = await this.publicPrisma.subscriptionPlan.findUnique({ where: { id: dto.subscription.subscriptionPlanId } });
      if (!plan) throw new BadRequestException('subscriptionPlanId non valido');

      // 3) Crea Subscription nel PUBLIC (schema aggiornato)
      const sub = await this.publicPrisma.subscription.create({
        data: {
          client: { connect: { id: createdClient.id } },
          plan: { connect: { id: plan.id } },
          amount: new PublicPrisma.Decimal(dto.subscription.amount),
          currency: dto.subscription.currency ?? 'EUR',
          contractTerm: dto.subscription.contractTerm,
          installmentPlan: dto.subscription.installmentPlan ?? (InstallmentPlan.ONE_SHOT as any),
          status: dto.subscription.status ?? SubscriptionStatus.ACTIVE,
          startsAt: dto.subscription.startsAt ? new Date(dto.subscription.startsAt) : undefined,
          nextBillingAt: dto.subscription.nextBillingAt ? new Date(dto.subscription.nextBillingAt) : undefined,
          endsAt: dto.subscription.endsAt ? new Date(dto.subscription.endsAt) : undefined,
        },
      });
      createdSub = { id: sub.id };

      // 4) Replica nel TENANT (shadow minimal)
      await this.tenantPrisma.client.upsert({
        where: { id: createdClient.id },
        update: {
          companyName: clientData.companyName,
          contactEmail: clientData.contactEmail,
          employeeRange: clientData.employeeRange,
          status: clientData.status as any, // tipi allineati (enum identico nel tenant)
        },
        create: {
          id: createdClient.id,
          companyName: clientData.companyName,
          contactEmail: clientData.contactEmail,
          employeeRange: clientData.employeeRange,
          status: clientData.status as any,
        },
      });

      // 4b) Inizializza BillingProfile nel TENANT usando i dati PUBLIC
      await (this.tenantPrisma as any).billingProfile.upsert({
        where: { clientId: createdClient.id },
        update: {},
        create: {
          clientId: createdClient.id,
          companyName: clientData.companyName,
          taxId: dto.client.billing.billingTaxId,
          address: dto.client.billing.billingAddressLine1,
          zip: dto.client.billing.billingZip,
          city: dto.client.billing.billingCity,
          province: dto.client.billing.billingProvince,
          country: dto.client.billing.billingCountry,
          billingEmail: dto.client.billing.billingEmail,
        },
      });

      // Replica/Upsert anche il piano nel TENANT per coerenza
      await this.tenantPrisma.subscriptionPlan.upsert({
        where: { id: plan.id },
        update: { name: plan.name, description: plan.description ?? undefined, price: plan.price as any, currency: plan.currency, billingCycle: plan.billingCycle as any, active: plan.active },
        create: { id: plan.id, name: plan.name, description: plan.description ?? undefined, price: plan.price as any, currency: plan.currency, billingCycle: plan.billingCycle as any, active: plan.active },
      });

      await this.tenantPrisma.subscription.create({
        data: {
          id: sub.id, // stesso id per correlazione
          clientId: createdClient.id,
          subscriptionPlanId: plan.id,
          amount: sub.amount as any,
          currency: sub.currency,
          installmentPlan: sub.installmentPlan as any,
          contractTerm: sub.contractTerm,
          status: sub.status as any,
          startsAt: sub.startsAt,
          nextBillingAt: sub.nextBillingAt ?? undefined,
          endsAt: sub.endsAt ?? undefined,
        },
      });

      // 4) Crea Admin INVITED come Owner + token di invito (token split)
      const adminEmail = clientData.contactEmail.toLowerCase();
      const selector = crypto.randomUUID();
      const tokenPlain = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48h

      const invited = await this.tenantPrisma.internalUser.create({
        data: {
          clientId: createdClient.id,
          email: adminEmail,
          password: '', // verrà impostata in activate
          role: 'ADMIN' as any,
          status: 'INVITED' as any,
          isOwner: true,
          canViewAllCases: true,
        },
        select: { id: true, email: true },
      });

      await this.tenantPrisma.userToken.create({
        data: {
          userId: invited.id,
          clientId: createdClient.id,
          type: 'INVITE' as any,
          selector,
          tokenHash,
          expiresAt,
        },
      });

      const frontendBase = process.env.FRONTEND_BASE_URL?.replace(/\/$/, '');
      const apiBase = process.env.API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000/v1';
      const activationUrl = frontendBase
        ? `${frontendBase}/activate?selector=${encodeURIComponent(selector)}&token=${encodeURIComponent(tokenPlain)}`
        : `${apiBase}/public/auth/activate?selector=${encodeURIComponent(selector)}&token=${encodeURIComponent(tokenPlain)}`;
      // In ambiente locale, logga il link di attivazione (in produzione invio e-mail)
      // eslint-disable-next-line no-console
      console.log(`[Signup] Activation link for ${invited.email}: ${activationUrl}`);

      const exposeUrl = process.env.EXPOSE_ACTIVATION_URLS === 'true' || process.env.NODE_ENV !== 'production';
      return {
        clientId: createdClient.id,
        subscriptionId: sub.id,
        status: 'SUCCESS',
        ownerInvite: {
          email: invited.email,
          expiresAt,
          ...(exposeUrl ? { activationUrl } : {}),
        },
      };
    } catch (e: any) {
      // COMPENSAZIONE PUBLIC in caso fallisca la replica TENANT o la creazione sub
      try {
        if (createdSub?.id) {
          await this.publicPrisma.subscription.delete({
            where: { id: createdSub.id },
          });
        }
      } catch {}
      try {
        if (createdClient?.id) {
          await this.publicPrisma.client.delete({
            where: { id: createdClient.id },
          });
        }
      } catch {}

      if (e?.code === 'P2002') {
        throw new ConflictException('Conflitto di chiavi (tenant).');
      }
      if (e?.code === 'P2003') {
        throw new BadRequestException(
          'FK non valida durante la replica nel tenant.',
        );
      }
      throw e;
    }
  }

  /**
   * CREATE (granulare) - mantiene compatibilità con la tua rotta esistente
   * Se usi questo endpoint per creare senza billing completo, i campi billing possono essere opzionali.
   */
  async create(dto: CreateClientDto) {
    const data: PublicPrisma.ClientCreateInput = {
      companyName: dto.companyName,
      contactEmail: dto.contactEmail,
      employeeRange: dto.employeeRange,

      // Billing opzionali se il DTO granular non li richiede tutti
      billingTaxId: (dto as any).billingTaxId,
      billingEmail: (dto as any).billingEmail,
      billingPec: (dto as any).billingPec,
      billingSdiCode: (dto as any).billingSdiCode,
      billingAddressLine1: (dto as any).billingAddressLine1,
      billingZip: (dto as any).billingZip,
      billingCity: (dto as any).billingCity,
      billingProvince: (dto as any).billingProvince,
      billingCountry: (dto as any).billingCountry,
    };

    try {
      const client = await this.publicPrisma.client.create({ data });

      await this.tenantPrisma.client.create({
        data: {
          id: client.id,
          companyName: client.companyName,
          contactEmail: client.contactEmail,
          employeeRange: client.employeeRange,
          status: client.status as any,
        },
      });

      return client;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(
          'Azienda o email/P.IVA già esistenti nel sistema.',
        );
      }
      throw e;
    }
  }

  /**
   * READ ALL - merge PUBLIC + TENANT (evitando duplicati per id)
   */
  async findAll() {
    const [publicClients, tenantClients] = await Promise.all([
      this.publicPrisma.client.findMany({
        include: { subscriptions: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.tenantPrisma.client.findMany({
        include: { subscriptions: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const merged = [
      ...publicClients.map((c) => ({ ...c, source: 'PUBLIC' })),
      ...tenantClients.map((c) => ({ ...c, source: 'TENANT' })),
    ].filter(
      (client, index, self) => index === self.findIndex((c) => c.id === client.id),
    );

    return merged;
  }

  /**
   * READ ONE - ritorna sia fonte PUBLIC che TENANT (se esistono)
   */
  async findOne(id: string) {
    const [clientPublic, clientTenant] = await Promise.all([
      this.publicPrisma.client.findUnique({
        where: { id },
        include: { subscriptions: true },
      }),
      this.tenantPrisma.client.findUnique({
        where: { id },
        include: { subscriptions: true },
      }),
    ]);

    if (!clientPublic && !clientTenant)
      throw new NotFoundException('Client non trovato in nessun database');

    return {
      public: clientPublic || null,
      tenant: clientTenant || null,
    };
  }

  /**
   * UPDATE - aggiorna in entrambi i DB
   */
  async update(id: string, dto: UpdateClientDto) {
    try {
      const updatedPublic = await this.publicPrisma.client.update({
        where: { id },
        data: dto as PublicPrisma.ClientUpdateInput,
      });

      await this.tenantPrisma.client.update({
        where: { id },
        data: {
          companyName: dto.companyName ?? undefined,
          contactEmail: dto.contactEmail ?? undefined,
          employeeRange: dto.employeeRange ?? undefined,
          status: (dto.status as any) ?? undefined,
        },
      });

      return updatedPublic;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(
          'Azienda o email/P.IVA già esistenti (vincolo univoco).',
        );
      }
      if (e?.code === 'P2025') {
        throw new NotFoundException('Client non trovato');
      }
      throw e;
    }
  }

  /**
   * DELETE - cancella prima nel TENANT e poi nel PUBLIC
   */
  async remove(id: string) {
    try {
      await this.tenantPrisma.client.delete({ where: { id } });
      return await this.publicPrisma.client.delete({ where: { id } });
    } catch (e: any) {
      if (e?.code === 'P2025') {
        throw new NotFoundException('Client non trovato');
      }
      throw e;
    }
  }

  /**
   * Lista Subscription per clientId da entrambi i DB (nota: campi diversi tra public e tenant)
   */
  async findSubscriptions(id: string) {
    const [publicSubs, tenantSubs] = await Promise.all([
      this.publicPrisma.subscription.findMany({
        where: { clientId: id },
        orderBy: { createdAt: 'desc' },
      }),
      this.tenantPrisma.subscription.findMany({
        where: { clientId: id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      public: publicSubs,
      tenant: tenantSubs,
    };
  }
}
