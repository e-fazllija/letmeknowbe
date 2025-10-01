import { Injectable } from '@nestjs/common';
import { PrismaPublicService } from '../prisma-public.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaPublicService) {}

  create(data: CreateSubscriptionDto) {
    return this.prisma.subscription.create({ data });
  }

  findAll() {
    return this.prisma.subscription.findMany({
      include: { client: true }, // includo anche i dati del cliente
    });
  }

  findOne(id: string) {
    return this.prisma.subscription.findUnique({
      where: { id },
      include: { client: true },
    });
  }

  remove(id: string) {
    return this.prisma.subscription.delete({ where: { id } });
  }
}
 