import { Module } from '@nestjs/common';
import { PublicVoiceController } from './public-voice.controller';
import { PublicVoiceService } from './public-voice.service';
import { TenantModule } from '../../tenant/tenant.module';
import { StorageModule } from '../../storage/storage.module';
import { NotificationsModule } from '../../common/notifications/notifications.module';

@Module({
  imports: [TenantModule, StorageModule, NotificationsModule],
  controllers: [PublicVoiceController],
  providers: [PublicVoiceService],
})
export class PublicVoiceModule {}
