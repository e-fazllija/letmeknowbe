import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UserStatus } from '../../generated/tenant';
import { InviteUserDto } from './dto/invite-user.dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaTenantService) {}

  async createForClient(clientId: string, dto: CreateUserDto) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.prisma.internalUser.create({
      data: { clientId, email: (dto.email || '').toLowerCase().trim(), password: hashedPassword, role: dto.role as any },
      select: { id: true, email: true, role: true, createdAt: true },
    });
  }

  findAllByClient(clientId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    return this.prisma.internalUser.findMany({
      where: { clientId },
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneByClient(clientId: string, id: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const user = await this.prisma.internalUser.findFirst({ where: { id, clientId }, select: { id: true, email: true, role: true, createdAt: true } });
    if (!user) throw new NotFoundException('Utente non trovato');
    return user;
  }

  async updateByClient(clientId: string, id: string, dto: UpdateUserDto) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const target = await this.prisma.internalUser.findUnique({ where: { id }, select: { id: true, clientId: true } });
    if (!target || target.clientId !== clientId) throw new NotFoundException('Utente non trovato');
    const updated = await this.prisma.internalUser.update({ where: { id }, data: dto, select: { id: true, email: true, role: true, createdAt: true } });
    return updated;
  }

  async softRemoveByClient(clientId: string, id: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const target = await this.prisma.internalUser.findUnique({ where: { id }, select: { id: true, clientId: true } });
    if (!target || target.clientId !== clientId) throw new NotFoundException('Utente non trovato');
    await this.prisma.internalUser.update({ where: { id }, data: { status: 'SUSPENDED' as any } });
    return;
  }

  async invite(clientId: string, dto: InviteUserDto) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const email = (dto.email || '').toLowerCase().trim();
    if (!email) throw new BadRequestException('Email obbligatoria');

    const exists = await this.prisma.internalUser.findUnique({ where: { clientId_email: { clientId, email } } });
    if (exists) throw new ForbiddenException('Utente già esistente');

    // placeholder password (random) fino ad attivazione
    const placeholder = crypto.randomBytes(24).toString('hex');
    const password = await bcrypt.hash(placeholder, 10);

    const user = await this.prisma.internalUser.create({
      data: {
        clientId,
        email,
        password,
        role: dto.role as any,
        status: 'INVITED' as any,
      },
      select: { id: true },
    });

    // Crea token invito: selector + tokenHash
    const selector = crypto.randomBytes(9).toString('hex');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const days = parseInt(process.env.INVITE_TTL_DAYS || '7', 10);
    const expiresAt = new Date(Date.now() + (isNaN(days) ? 7 : days) * 24 * 60 * 60 * 1000);

    await this.prisma.userToken.create({
      data: {
        userId: user.id,
        clientId,
        type: 'INVITE' as any,
        selector,
        tokenHash,
        expiresAt,
      },
    });

    // TODO: invio email con (selector, rawToken)
    return { userId: user.id };
  }
}
