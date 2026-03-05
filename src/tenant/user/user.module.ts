import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaTenantService } from '../prisma-tenant.service';
import { TenantModule } from '../tenant.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ActiveClientGuard } from '../../common/guards/active-client.guard';
import { NotificationsModule } from '../../common/notifications/notifications.module'; 

@Module({
  imports: [TenantModule, JwtModule.register({}), NotificationsModule],
  controllers: [UserController],
  providers: [UserService, JwtAuthGuard, RolesGuard, ActiveClientGuard],
  exports: [UserService]
})
export class UserModule {}
 
