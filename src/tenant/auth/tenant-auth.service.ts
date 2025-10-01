import { Injectable } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TenantAuthService {
  constructor(private prisma: PrismaTenantService) {}

  async signup(dto: SignupDto) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        tenantId: dto.tenantId,
        email: dto.email,
        password: hashedPassword,
        role: dto.role,
      },
    });
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new Error('Invalid credentials');

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) throw new Error('Invalid credentials');

    // Per ora ritorniamo solo l’utente (in futuro JWT)
    return { message: 'Login successful', userId: user.id, role: user.role };
  }
}
 