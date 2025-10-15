import { Module } from '@nestjs/common';
import { PublicVoiceController } from './public-voice.controller';
import { PublicVoiceService } from './public-voice.service';
import { TenantModule } from '../../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [PublicVoiceController],
  providers: [PublicVoiceService],
})
export class PublicVoiceModule {}

