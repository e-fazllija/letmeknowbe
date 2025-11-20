import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';

// Servizi Prisma
import { PrismaPublicService } from '../prisma-public.service';
import { PrismaTenantService } from './../../tenant/prisma-tenant.service';

// Modulo Tenant (importante per poter iniettare PrismaTenantService)
import { TenantModule } from './../../tenant/tenant.module';
import { PlatformOptionalGuard } from '../../platform/guards/platform-optional.guard';
import { NotificationsModule } from 'common/notifications/notifications.module';


@Module({
  imports: [
    TenantModule,
    NotificationsModule,
    JwtModule.register({}),
  ],
  controllers: [
    ClientController, // Le route /v1/public/clients
  ],
  providers: [
    ClientService,          // Il service principale
    PrismaPublicService,    // DB pubblico (Intent)
    PlatformOptionalGuard,
    // PrismaTenantService is provided by TenantModule
  ],
  exports: [
    ClientService,          // opzionale — utile se serve da altri moduli
  ],
})
export class ClientModule {}
