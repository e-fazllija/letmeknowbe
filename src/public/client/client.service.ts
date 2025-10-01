import { Injectable } from '@nestjs/common';
import { PrismaPublicService } from '../prisma-public.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Prisma } from '../../generated/public';

@Injectable()
export class ClientService {
  constructor(private prisma: PrismaPublicService) {}

  create(dto: CreateClientDto) {
    const data: Prisma.ClientCreateInput = {
      companyName: dto.companyName,
      contactEmail: dto.contactEmail,
      employeeRange: dto.employeeRange,
      // status è opzionale e ha default "ACTIVE" nello schema
    };

    return this.prisma.client.create({ data });
  }

  findAll() {
    return this.prisma.client.findMany({ include: { subscriptions: true } });
  }
}
