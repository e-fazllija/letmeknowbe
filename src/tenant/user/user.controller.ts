import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('tenant-users')
@Controller('tenant/users')
export class UserController {
  constructor(private service: UserService) {}

  @Post()
  @ApiOperation({ summary: 'Crea AGENT sul db nella tabella internaluser' })
  create(@Body() dto: CreateUserDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Ritorna tutti gli AGENT e ADMIN dal db nella tabella internaluser' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ritorna gli AGENT o ADMIN dal db nella tabella internaluser tramite id utente' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifica gli AGENT o ADMIN nella tabella internaluser tramite id utente' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina gli AGENT o ADMIN nella tabella internaluser tramite id utente' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
 