import { Injectable } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaTenantService) {}

  async create(dto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.prisma.internalUser.create({
      data: { ...dto, password: hashedPassword },
    });
  }

  findAll() {
    return this.prisma.internalUser.findMany();
  }

  findOne(id: string) {
    return this.prisma.internalUser.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdateUserDto) {
    return this.prisma.internalUser.update({
      where: { id },
      data: dto,
    });
  }

  remove(id: string) {
    return this.prisma.internalUser.delete({ where: { id } });
  }
}
