import { Module } from '@nestjs/common';
import { PublicAuthController } from './public-auth.controller';
import { PublicAuthService } from './public-auth.service';
import { TenantModule } from '../../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [PublicAuthController],
  providers: [PublicAuthService],
})
export class PublicAuthModule {}

