import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { SignupClientDto } from './dto/signup-client.dto';
import { PlatformOptionalGuard } from '../../platform/guards/platform-optional.guard';

@ApiTags('public-clients')
@Controller('public/clients')
@UseGuards(PlatformOptionalGuard)
@ApiBearerAuth('access-token')
export class ClientController {
  constructor(private readonly service: ClientService) {}

  // signup orchestrato
  @Post('signup')
  @ApiOperation({ summary: 'Crea azienda + subscription (onboarding aziendale)' })
  signup(@Body() dto: SignupClientDto) {
    return this.service.signupOrchestrated(dto);
  }

  // path “puliti” per le rotte esistenti
  @Post()
  @ApiOperation({ summary: 'Crea un nuovo client (rotte granulari)' })
  create(@Body() dto: CreateClientDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista aziende' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio azienda' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifica azienda' })
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina azienda' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get(':id/subscriptions')
  @ApiOperation({ summary: 'Lista sottoscrizioni di un’azienda' })
  findSubscriptions(@Param('id') id: string) {
    return this.service.findSubscriptions(id);
  }
}
