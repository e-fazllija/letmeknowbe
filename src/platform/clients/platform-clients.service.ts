import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaPublicService } from '../../public/prisma-public.service';

@Injectable()
export class PlatformClientsService {
  constructor(private readonly publicPrisma: PrismaPublicService) {}

  findAll() {
    return this.publicPrisma.client.findMany({
      include: { subscriptions: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const client = await this.publicPrisma.client.findUnique({
      where: { id },
      include: { subscriptions: true },
    });
    if (!client) throw new NotFoundException('Client non trovato');
    return client;
  }
}

