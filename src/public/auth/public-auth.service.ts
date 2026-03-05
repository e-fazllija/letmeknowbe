import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';
import { PrismaPublicService } from '../prisma-public.service';
import { ActivateDto } from './dto/activate.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { ResendOwnerInviteDto } from './dto/resend-owner-invite.dto';
import { ChangeOwnerEmailDto } from './dto/change-owner-email.dto';

@Injectable()
export class PublicAuthService {
  constructor(
    private prisma: PrismaTenantService,
    private publicPrisma: PrismaPublicService,
    private notify: NotificationsService,
  ) {}

  async activate(dto: ActivateDto) {
    const now = new Date();
    const token = await this.prisma.userToken.findUnique({ where: { selector: dto.selector } });

    if (!token) throw new NotFoundException('Token non trovato');
    if (token.usedAt) throw new BadRequestException('Token già usato');
    if (token.expiresAt < now) throw new BadRequestException('Token scaduto');
    if (token.type !== ('INVITE' as any)) throw new BadRequestException('Tipo token non valido');

    const hash = crypto.createHash('sha256').update(dto.token).digest('hex');
    if (hash !== token.tokenHash) throw new BadRequestException('Token non valido');

    const user = await this.prisma.internalUser.findUnique({ where: { id: token.userId } });
    if (!user) throw new NotFoundException('Utente non trovato');
    if (user.status && user.status !== ('INVITED' as any)) {
      throw new BadRequestException('Invito non più valido');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction([
      this.prisma.internalUser.update({
        where: { id: user.id },
        data: { password: passwordHash, status: 'ACTIVE' as any },
      }),
      this.prisma.userToken.update({
        where: { selector: dto.selector },
        data: { usedAt: now },
      }),
    ]);

    return { message: 'Account attivato. Ora puoi effettuare il login.' };
  }

  async resendOwnerInvite(dto: ResendOwnerInviteDto) {
    const clientId = dto.clientId.trim();
    const emailFilter = dto.email?.trim().toLowerCase();

    // 1) Trova l'owner INVITED per questo tenant
    const user = await this.prisma.internalUser.findFirst({
      where: {
        clientId,
        isOwner: true,
        status: 'INVITED' as any,
        ...(emailFilter ? { email: emailFilter } : {}),
      },
      select: { id: true, email: true, clientId: true },
    });

    if (!user) {
      throw new NotFoundException('Nessun owner in stato INVITED trovato per questo tenant.');
    }

    const email = (user.email || '').toLowerCase().trim();
    if (!email) {
      throw new BadRequestException('Owner senza email valida.');
    }

    // 2) Invalida eventuali token INVITE precedenti per questo utente
    await this.prisma.userToken.deleteMany({
      where: { userId: user.id, clientId: user.clientId, type: 'INVITE' as any },
    });

    // 3) Crea nuovo token INVITE (selector + tokenHash)
    const selector = crypto.randomUUID();
    const tokenPlain = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48h

    await this.prisma.userToken.create({
      data: {
        userId: user.id,
        clientId: user.clientId,
        type: 'INVITE' as any,
        selector,
        tokenHash,
        expiresAt,
      },
    });

    // 4) Costruisci activationUrl come nel signup
    const frontendBase = (process.env.FRONTEND_BASE_URL || '').trim().replace(/\/$/, '');
    const apiBase = (process.env.API_BASE_URL || '').trim().replace(/\/$/, '') || 'http://localhost:3000/v1';
    const activationUrl = frontendBase
      ? `${frontendBase}/activate?selector=${encodeURIComponent(selector)}&token=${encodeURIComponent(tokenPlain)}`
      : `${apiBase}/public/auth/activate?selector=${encodeURIComponent(selector)}&token=${encodeURIComponent(tokenPlain)}`;

    // 5) Recupera nome tenant (best effort)
    let tenantName: string | undefined;
    try {
      const c = await this.prisma.client.findUnique({
        where: { id: user.clientId },
        select: { companyName: true },
      });
      tenantName = c?.companyName || undefined;
    } catch {
      tenantName = undefined;
    }

    // 6) Invio email (o solo log in base a INVITE_EMAIL_ENABLED/SMTP)
    try {
      await this.notify.sendOwnerInvite({
        email,
        activationUrl,
        expiresAt,
        tenantName,
      });
    } catch {
      // le notifiche non devono bloccare la risposta
    }

    // Dev log sintetico
    try {
      // eslint-disable-next-line no-console
      console.info('[owner-resend] activation link', {
        email,
        clientId,
        expiresAt: expiresAt.toISOString(),
        activationUrl,
      });
    } catch {}

    return { message: "Invito owner reinviato (se l'indirizzo e' valido)." };
  }

  async changeOwnerEmail(dto: ChangeOwnerEmailDto) {
    const clientId = dto.clientId.trim();
    const newEmail = dto.newEmail.trim().toLowerCase();

    // 1) Trova l'owner INVITED per questo tenant
    const user = await this.prisma.internalUser.findFirst({
      where: {
        clientId,
        isOwner: true,
        status: 'INVITED' as any,
      },
      select: { id: true, email: true, clientId: true },
    });

    if (!user) {
      throw new NotFoundException('Nessun owner in stato INVITED trovato per questo tenant.');
    }

    // 2) Verifica che la nuova email non sia già usata da un altro utente del tenant
    const existing = await this.prisma.internalUser.findUnique({
      where: {
        clientId_email: { clientId, email: newEmail },
      },
      select: { id: true },
    });
    if (existing && existing.id !== user.id) {
      throw new ConflictException('Email già utilizzata per questo tenant.');
    }

    // 3) Aggiorna l'email dell'owner
    await this.prisma.internalUser.update({
      where: { id: user.id },
      data: { email: newEmail },
    });

    // 3b) Aggiorna contactEmail su Client TENANT e PUBLIC (best effort)
    try {
      await this.prisma.client.update({
        where: { id: clientId },
        data: { contactEmail: newEmail },
      });
    } catch {}
    try {
      await this.publicPrisma.client.update({
        where: { id: clientId },
        data: { contactEmail: newEmail },
      });
    } catch {}

    // 4) Invalida token INVITE precedenti
    await this.prisma.userToken.deleteMany({
      where: { userId: user.id, clientId: user.clientId, type: 'INVITE' as any },
    });

    // 5) Crea nuovo token INVITE (selector + tokenHash)
    const selector = crypto.randomUUID();
    const tokenPlain = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48h

    await this.prisma.userToken.create({
      data: {
        userId: user.id,
        clientId: user.clientId,
        type: 'INVITE' as any,
        selector,
        tokenHash,
        expiresAt,
      },
    });

    // 6) Costruisci activationUrl come nel signup
    const frontendBase = (process.env.FRONTEND_BASE_URL || '').trim().replace(/\/$/, '');
    const apiBase = (process.env.API_BASE_URL || '').trim().replace(/\/$/, '') || 'http://localhost:3000/v1';
    const activationUrl = frontendBase
      ? `${frontendBase}/activate?selector=${encodeURIComponent(selector)}&token=${encodeURIComponent(tokenPlain)}`
      : `${apiBase}/public/auth/activate?selector=${encodeURIComponent(selector)}&token=${encodeURIComponent(tokenPlain)}`;

    // 7) Recupera nome tenant (best effort)
    let tenantName: string | undefined;
    try {
      const c = await this.prisma.client.findUnique({
        where: { id: user.clientId },
        select: { companyName: true },
      });
      tenantName = c?.companyName || undefined;
    } catch {
      tenantName = undefined;
    }

    // 8) Invio email (o solo log in base a INVITE_EMAIL_ENABLED/SMTP)
    try {
      await this.notify.sendOwnerInvite({
        email: newEmail,
        activationUrl,
        expiresAt,
        tenantName,
      });
    } catch {
      // le notifiche non devono bloccare la risposta
    }

    // Dev log sintetico
    try {
      // eslint-disable-next-line no-console
      console.info('[owner-change-email] activation link', {
        email: newEmail,
        clientId,
        expiresAt: expiresAt.toISOString(),
        activationUrl,
      });
    } catch {}

    return { message: "Email aggiornata e invito reinviato (se l'indirizzo e' valido)." };
  }
}
