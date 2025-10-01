import { Module } from '@nestjs/common';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';
import { PrismaPublicService } from '../prisma-public.service';

@Module({
  controllers: [ClientController],
  providers: [ClientService, PrismaPublicService],
  exports:[ClientService]
})
export class ClientModule {}
 