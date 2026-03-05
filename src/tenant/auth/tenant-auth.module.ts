import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantAuthService } from './tenant-auth.service';
import { TenantAuthController } from './tenant-auth.controller';
import { PrismaTenantService } from '../prisma-tenant.service';
import { TenantModule } from '../tenant.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [
    TenantModule,
    JwtModule.register({}),
  ],
  controllers: [TenantAuthController],
  providers: [TenantAuthService, JwtAuthGuard],
})
export class TenantAuthModule {}

 
