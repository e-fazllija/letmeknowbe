import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
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
import { PublicReportModule } from './public/report/public-report.module';
import { PublicVoiceModule } from './public/voice/public-voice.module';
import { HealthModule } from './health/health.module';
import { DepartmentModule } from './tenant/department/department.module';
import { CategoryModule } from './tenant/category/category.module';
import { StatsModule } from './tenant/stats/stats.module';
import { RateLimitFilter } from './common/filters/rate-limit.filter';

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
    PublicReportModule,
    PublicVoiceModule,
    ClientModule,
    SubscriptionModule,
    TenantAuthModule,
    UserModule,
    ReportModule,
    HealthModule,
    DepartmentModule,
    CategoryModule,
    StatsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: RateLimitFilter },
  ],
})
export class AppModule {}
