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

  async softRemoveByClient(clientId: string, targetUserId: string, actorUserId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const [target, actor] = await Promise.all([
      this.prisma.internalUser.findUnique({ where: { id: targetUserId }, select: { id: true, clientId: true, role: true, isOwner: true } }),
      this.prisma.internalUser.findUnique({ where: { id: actorUserId }, select: { id: true, clientId: true, role: true, isOwner: true } }),
    ]);
    if (!target || target.clientId !== clientId) throw new NotFoundException('Utente non trovato');
    if (!actor || actor.clientId !== clientId) throw new ForbiddenException('Operazione non consentita');

    // Policy:
    // - solo ADMIN possono eliminare
    // - un ADMIN può eliminare un altro ADMIN solo se è owner
    // - l'owner può essere eliminato solo da se stesso (self-delete)
    const actorRole = String((actor as any).role || '').toUpperCase();
    const targetRole = String((target as any).role || '').toUpperCase();
    const actorIsOwner = !!(actor as any).isOwner;
    const targetIsOwner = !!(target as any).isOwner;

    if (actorRole !== 'ADMIN') throw new ForbiddenException('Operazione non consentita');
    // Owner non eliminabile via API tenant (neppure self-delete)
    if (targetIsOwner) throw new ForbiddenException('Owner non eliminabile');
    if (targetRole === 'ADMIN' && actor.id !== target.id && !actorIsOwner) {
      throw new ForbiddenException('Solo l\'owner può eliminare un admin');
    }

    // Non lasciare zero ADMIN attivi nel tenant
    const remainingAdmins = await this.prisma.internalUser.count({
      where: { clientId, role: 'ADMIN' as any, status: 'ACTIVE' as any, id: { not: targetUserId } },
    } as any);
    if (remainingAdmins === 0) {
      throw new ForbiddenException('Deve restare almeno un ADMIN attivo nel tenant');
    }

    await this.prisma.internalUser.update({ where: { id: targetUserId }, data: { status: 'SUSPENDED' as any } });
    return;
  }

  /**
   * HARD DELETE: rimuove l'utente e scollega i riferimenti (report assegnati, log, sessioni, token).
   */
  async hardRemoveByClient(clientId: string, targetUserId: string, actorUserId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const [target, actor] = await Promise.all([
      this.prisma.internalUser.findUnique({ where: { id: targetUserId }, select: { id: true, clientId: true, role: true, isOwner: true } }),
      this.prisma.internalUser.findUnique({ where: { id: actorUserId }, select: { id: true, clientId: true, role: true, isOwner: true } }),
    ]);
    if (!target || target.clientId !== clientId) throw new NotFoundException('Utente non trovato');
    if (!actor || actor.clientId !== clientId) throw new ForbiddenException('Operazione non consentita');

    const actorRole = String((actor as any).role || '').toUpperCase();
    const targetRole = String((target as any).role || '').toUpperCase();
    const actorIsOwner = !!(actor as any).isOwner;
    const targetIsOwner = !!(target as any).isOwner;

    if (actorRole !== 'ADMIN') throw new ForbiddenException('Operazione non consentita');
    // Owner non eliminabile via API tenant (neppure self-delete)
    if (targetIsOwner) throw new ForbiddenException('Owner non eliminabile');
    if (targetRole === 'ADMIN' && actor.id !== target.id && !actorIsOwner) {
      throw new ForbiddenException('Solo l\'owner può eliminare un admin');
    }

    // Non lasciare zero ADMIN attivi nel tenant
    const remainingAdmins = await this.prisma.internalUser.count({
      where: { clientId, role: 'ADMIN' as any, status: 'ACTIVE' as any, id: { not: targetUserId } },
    } as any);
    if (remainingAdmins === 0) {
      throw new ForbiddenException('Deve restare almeno un ADMIN attivo nel tenant');
    }

    await this.prisma.$transaction([
      this.prisma.whistleReport.updateMany({ where: { clientId, internalUserId: targetUserId }, data: { internalUserId: null, assignedAt: null } }),
      this.prisma.reportMessage.updateMany({ where: { authorId: targetUserId }, data: { authorId: null } } as any),
      this.prisma.reportStatusHistory.updateMany({ where: { clientId, agentId: targetUserId }, data: { agentId: null } } as any),
      this.prisma.refreshSession.deleteMany({ where: { userId: targetUserId } }),
      this.prisma.userRecoveryCode.deleteMany({ where: { userId: targetUserId } } as any),
      this.prisma.userToken.deleteMany({ where: { userId: targetUserId } }),
      this.prisma.internalUser.delete({ where: { id: targetUserId } }),
    ] as any);

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

    // Dev convenience: log activation link (do not persist raw token)
    try {
      const frontendBase = (process.env.FRONTEND_BASE_URL || '').trim().replace(/\/$/, '');
      const apiBase = (process.env.API_BASE_URL || '').trim().replace(/\/$/, '');
      const activationUrl = frontendBase
        ? `${frontendBase}/activate?selector=${encodeURIComponent(selector)}&token=${encodeURIComponent(rawToken)}`
        : (apiBase ? `${apiBase}/public/auth/activate?selector=${encodeURIComponent(selector)}&token=${encodeURIComponent(rawToken)}` : undefined);

      const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
      const exposeUrl = String(process.env.INVITE_EXPOSE_URL || (isProd ? 'false' : 'true')).toLowerCase() === 'true';
      const exposeToken = String(process.env.INVITE_EXPOSE_TOKEN || (isProd ? 'false' : 'false')).toLowerCase() === 'true';
      if (activationUrl && exposeUrl) {
        // eslint-disable-next-line no-console
        console.info('[invite] activation link', { email, expiresAt: expiresAt.toISOString(), activationUrl });
        if (exposeToken) {
          // eslint-disable-next-line no-console
          console.info('[invite] selector/token (dev only)', { selector, token: rawToken });
        }
      }
    } catch {}

    // TODO: invio email reale con (selector, rawToken) quando SMTP è configurato
    return { userId: user.id };
  }
}
