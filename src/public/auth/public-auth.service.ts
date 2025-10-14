import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';
import { ActivateDto } from './dto/activate.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PublicAuthService {
  constructor(private prisma: PrismaTenantService) {}

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
}
