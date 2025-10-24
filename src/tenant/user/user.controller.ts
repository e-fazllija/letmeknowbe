import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { Request } from 'express';
import { InviteUserDto } from './dto/invite-user.dto';

@ApiTags('tenant-users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('tenant/users')
export class UserController {
  constructor(private service: UserService) {}

  @Post()
  @ApiOperation({ summary: 'Crea AGENT sul db nella tabella internaluser' })
  create(@Req() req: Request, @Body() dto: CreateUserDto) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.createForClient(clientId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Ritorna tutti gli AGENT e ADMIN dal db nella tabella internaluser' })
  findAll(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.findAllByClient(clientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ritorna gli AGENT o ADMIN dal db nella tabella internaluser tramite id utente' })
  findOne(@Req() req: Request, @Param('id') id: string) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.findOneByClient(clientId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifica gli AGENT o ADMIN nella tabella internaluser tramite id utente' })
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.updateByClient(clientId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina gli AGENT o ADMIN nella tabella internaluser tramite id utente' })
  @HttpCode(204)
  remove(@Req() req: Request, @Param('id') id: string) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.softRemoveByClient(clientId, id);
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invita un utente (ADMIN o AGENT) creando un token di attivazione' })
  async invite(@Req() req: Request, @Body() dto: InviteUserDto) {
    const clientId = (req as any)?.user?.clientId as string;
    const res = await this.service.invite(clientId, dto);
    return { message: 'INVITED', userId: res.userId };
  }
}
 
