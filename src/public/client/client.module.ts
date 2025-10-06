import { Module } from '@nestjs/common';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';

// Servizi Prisma
import { PrismaPublicService } from '../prisma-public.service';
import { PrismaTenantService } from './../../tenant/prisma-tenant.service';

// Modulo Tenant (importante per poter iniettare PrismaTenantService)
import { TenantModule } from './../../tenant/tenant.module';

@Module({
  imports: [
    TenantModule, 
  ],
  controllers: [
    ClientController, // Le route /v1/public/clients
  ],
  providers: [
    ClientService,          // Il service principale
    PrismaPublicService,    // DB pubblico (Intent)
    PrismaTenantService,    // DB tenant (aziende clienti)
  ],
  exports: [
    ClientService,          // opzionale — utile se serve da altri moduli
  ],
})
export class ClientModule {}
