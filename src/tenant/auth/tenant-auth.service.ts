import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TenantAuthService {
  constructor(private prisma: PrismaTenantService) {}

  private normalizeEmail(email: string) {
    return email?.trim().toLowerCase();
  }

  async signup(dto: SignupDto) {
    const email = this.normalizeEmail(dto.email);

    if (!email || !dto.password || !dto.clientId || !dto.role) {
      throw new BadRequestException('clientId, email, password e role sono obbligatori.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    try {
      const user = await this.prisma.internalUser.create({
        data: {
          clientId: dto.clientId,
          email,
          password: hashedPassword,
          role: dto.role, 
        },
        select: {
          id: true,
          clientId: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      return {
        message: 'Registrazione completata',
        user,
      };
    } catch (e: any) {
      if (e?.code === 'P2002' && Array.isArray(e?.meta?.target) && e.meta.target.includes('email')) {
        throw new ConflictException('Email già registrata.');
      }
      throw e;
    }
  }

  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);

    if (!email || !dto.password) {
      throw new BadRequestException('Email e password sono obbligatorie.');
    }

    const user = await this.prisma.internalUser.findUnique({
      where: { email },
      select: { id: true, clientId: true, email: true, role: true, password: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenziali non valide.');
    }

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Credenziali non valide.');
    }

    // In futuro possibile implementazione JWT per coprire userID o email:

    return {
      message: 'Login effettuato con successo',
      user: {
        id: user.id,
        clientId: user.clientId,
        email: user.email,
        role: user.role,
      },
    };
  }
}
 