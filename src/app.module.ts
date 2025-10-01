import { Module } from '@nestjs/common';
import { UserModule } from './tenant/user/user.module';
import { ReportModule } from './tenant/report/report.module';
import { TenantAuthModule } from './tenant/auth/tenant-auth.module';
import { ClientModule } from './public/client/client.module';
import { SubscriptionModule } from './public/subscription/subscription.module';

@Module({
  imports: [
    ClientModule,
    SubscriptionModule,
    TenantAuthModule,
    UserModule,
    ReportModule,
  ],
})
export class AppModule {}
