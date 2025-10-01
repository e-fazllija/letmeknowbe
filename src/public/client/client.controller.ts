import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';

@ApiTags('public-clients')
@Controller('public/clients')
export class ClientController {
  constructor(private readonly service: ClientService) {}

  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
 