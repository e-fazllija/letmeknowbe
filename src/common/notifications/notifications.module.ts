import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { TenantModule } from '../../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

