import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaPublicService } from '../prisma-public.service';
import { PrismaTenantService } from './../../tenant/prisma-tenant.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Prisma } from '../../generated/public';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientService {
  constructor(
    private publicPrisma: PrismaPublicService,
    private tenantPrisma: PrismaTenantService,
  ) {}

  //Crea il client in entrambi i DB
  async create(dto: CreateClientDto) {
    const data: Prisma.ClientCreateInput = {
      companyName: dto.companyName,
      contactEmail: dto.contactEmail,
      employeeRange: dto.employeeRange,
    };

    try {
      const client = await this.publicPrisma.client.create({ data });
      await this.tenantPrisma.client.create({
        data: {
          id: client.id,
          companyName: client.companyName,
          contactEmail: client.contactEmail,
          employeeRange: client.employeeRange,
        },
      });
      return client;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('Azienda o email già esistenti');
      }
      throw e;
    }
  }

  //Legge tutti i clienti da ENTRAMBI i DB
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

    // unisce ed elimina duplicati per ID
    const merged = [
      ...publicClients.map(c => ({ ...c, source: 'INTENT' })),
      ...tenantClients.map(c => ({ ...c, source: 'TENANT' })),
    ].filter(
      (client, index, self) =>
        index === self.findIndex(c => c.id === client.id)
    );

    return merged;
  }

  //Legge un singolo client da entrambi i DB
  async findOne(id: string) {
    const [clientIntent, clientTenant] = await Promise.all([
      this.publicPrisma.client.findUnique({
        where: { id },
        include: { subscriptions: true },
      }),
      this.tenantPrisma.client.findUnique({
        where: { id },
        include: { subscriptions: true },
      }),
    ]);

    if (!clientIntent && !clientTenant)
      throw new NotFoundException('Client non trovato in nessun database');

    // ritorna entrambi se presenti
    return {
      intent: clientIntent || null,
      tenant: clientTenant || null,
    };
  }

  //Aggiorna in entrambi i DB
  async update(id: string, dto: UpdateClientDto) {
    try {
      const updatedIntent = await this.publicPrisma.client.update({
        where: { id },
        data: dto as Prisma.ClientUpdateInput,
      });

      await this.tenantPrisma.client.update({
        where: { id },
        data: dto as Prisma.ClientUpdateInput,
      });

      return updatedIntent;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('Azienda o email già esistenti');
      }
      if (e?.code === 'P2025') {
        throw new NotFoundException('Client non trovato');
      }
      throw e;
    }
  }

  //Cancella in entrambi i DB
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

  //Ottiene tutte le subscription da ENTRAMBI i DB
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
      intent: publicSubs,
      tenant: tenantSubs,
    };
  }
}