import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/config.validation';
import { UserModule } from './tenant/user/user.module';
import { ReportModule } from './tenant/report/report.module';
import { TenantAuthModule } from './tenant/auth/tenant-auth.module';
import { ClientModule } from './public/client/client.module';
import { SubscriptionModule } from './public/subscription/subscription.module';
import { PublicAuthModule } from './public/auth/public-auth.module';
import { PlatformModule } from './platform/platform.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema }),
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 20,
      },
    ]),
    PlatformModule,
    PublicAuthModule,
    ClientModule,
    SubscriptionModule,
    TenantAuthModule,
    UserModule,
    ReportModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
