import { Body, Controller, Delete, Get, Patch, Post, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('public-clients')
@Controller('public/clients')
export class ClientController {
  constructor(private readonly service: ClientService) {}

  @Post('Signup-azienda')
  create(@Body() dto: CreateClientDto) {
    return this.service.create(dto);
  }

  @Get('Get-aziende')
  findAll() {
    return this.service.findAll();
  }

  @Get('Get-azienda:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch('Modifica-azienda:id')
  update(@Param('id') id: string, @Body()dto: UpdateClientDto){
    return this.service.update(id, dto);
  }


  @Delete('Delete-azienda:id')
  remove(@Param('id')id: string){
    return this.service.remove(id);
  }

  @Get('Subscription-azienda:id')
  findSubscriptions(@Param('id') id:string){
    return this.service.findSubscriptions(id);
  }

}
 