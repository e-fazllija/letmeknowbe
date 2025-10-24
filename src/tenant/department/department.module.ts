import { Module } from '@nestjs/common';
import { DepartmentController } from './department.controller';
import { DepartmentService } from './department.service';
import { TenantModule } from '../tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [DepartmentController],
  providers: [DepartmentService],
})
export class DepartmentModule {}

