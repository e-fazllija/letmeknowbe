import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { TenantModule } from '../tenant.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ActiveClientGuard } from '../../common/guards/active-client.guard';

@Module({
  imports: [TenantModule, JwtModule.register({})],
  controllers: [CategoryController],
  providers: [CategoryService, JwtAuthGuard, RolesGuard, ActiveClientGuard],
})
export class CategoryModule {}
