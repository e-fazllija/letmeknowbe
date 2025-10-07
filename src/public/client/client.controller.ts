import { Body, Controller, Delete, Get, Patch, Post, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('public-clients')
@Controller('public/clients')
export class ClientController {
  constructor(private readonly service: ClientService) {}

  @Post('Signup-azienda')
  @ApiOperation({ summary: 'Crea un nuovo utente azienda nella tabella client' })
  create(@Body() dto: CreateClientDto) {
    return this.service.create(dto);
  }

  @Get('Get-aziende')
  @ApiOperation({ summary: 'Ritorna tutte le aziende registrate' })
  findAll() {
    return this.service.findAll();
  }

  @Get('Get-azienda:id')
  @ApiOperation({ summary: 'Ritorna la singola azienda tramite il clientid' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch('Modifica-azienda:id')
  @ApiOperation({ summary: 'Permette di modificare i dati di un azienda gia registrata tramite il clientid' })
  update(@Param('id') id: string, @Body()dto: UpdateClientDto){
    return this.service.update(id, dto);
  }


  @Delete('Delete-azienda:id')
  @ApiOperation({ summary: 'Permette di eliminare un azienda tramite il clientid' })
  remove(@Param('id')id: string){
    return this.service.remove(id);
  }

  @Get('Subscription-azienda:id')
  @ApiOperation({ summary: 'Ritorna la sssottoscrizione di una singla azienda tramite clientid' })
  findSubscriptions(@Param('id') id:string){
    return this.service.findSubscriptions(id);
  }

}
 