import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DepartmentController } from './department.controller';
import { DepartmentService } from './department.service';
import { TenantModule } from '../tenant.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [TenantModule, JwtModule.register({})],
  controllers: [DepartmentController],
  providers: [DepartmentService, JwtAuthGuard, RolesGuard],
})
export class DepartmentModule {}
