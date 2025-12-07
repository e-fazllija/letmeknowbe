import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantModule } from '../tenant.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ActiveClientGuard } from '../../common/guards/active-client.guard';

@Module({
  imports: [TenantModule, JwtModule.register({})],
  controllers: [TemplatesController],
  providers: [TemplatesService, JwtAuthGuard, RolesGuard, ActiveClientGuard],
})
export class TemplatesModule {}

