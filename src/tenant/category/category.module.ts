import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { TenantModule } from '../tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [CategoryController],
  providers: [CategoryService],
})
export class CategoryModule {}

