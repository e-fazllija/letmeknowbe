import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PublicUserService } from './public-user.service';
import { CreatePublicUserDto } from './dto/create-public-user.dto';
import { UpdatePublicUserDto } from './dto/update-public-user.dto';

@ApiTags('tenant/public-users')
@Controller('v1/tenant/public-users')
export class PublicUserController {
  constructor(private readonly service: PublicUserService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un nuovo utente pubblico collegato a un report' })
  create(@Body() dto: CreatePublicUserDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Recupera tutti gli utenti pubblici' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Recupera un utente pubblico tramite ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Aggiorna un utente pubblico' })
  update(@Param('id') id: string, @Body() dto: UpdatePublicUserDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina un utente pubblico' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
