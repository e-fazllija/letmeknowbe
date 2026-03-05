import { Controller, Get, Post, Body, Param, Patch, Delete, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PublicUserService } from './public-user.service';
import { CreatePublicUserDto } from './dto/create-public-user.dto';
import { UpdatePublicUserDto } from './dto/update-public-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ActiveClientGuard } from '../../common/guards/active-client.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { Request } from 'express';

@ApiTags('tenant/public-users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ActiveClientGuard, RolesGuard)
@Roles('ADMIN')
@Controller('v1/tenant/public-users')
export class PublicUserController {
  constructor(private readonly service: PublicUserService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un nuovo utente pubblico collegato a un report' })
  create(@Req() req: Request, @Body() dto: CreatePublicUserDto) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.createForClient(clientId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Recupera tutti gli utenti pubblici' })
  findAll(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.findAllByClient(clientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Recupera un utente pubblico tramite ID' })
  findOne(@Req() req: Request, @Param('id') id: string) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.findOneByClient(clientId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Aggiorna un utente pubblico' })
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePublicUserDto) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.updateByClient(clientId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina un utente pubblico' })
  remove(@Req() req: Request, @Param('id') id: string) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.removeByClient(clientId, id);
  }
}
