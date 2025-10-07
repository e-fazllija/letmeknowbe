import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiParam, ApiTags, ApiOperation } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@ApiTags('public-subscriptions')
@Controller('public/subscriptions')
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  @Post()
  @ApiOperation({ summary: 'Crea la sottoscrizione dell’azienda tramite clientId' })
  create(@Body() dto: CreateSubscriptionDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Ritorna tutte le sottoscrizioni presenti nel DB' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ritorna la sottoscrizione tramite ID' })
  @ApiParam({ name: 'id', required: true, description: 'Subscription id' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifica la sottoscrizione tramite ID' })
  @ApiParam({ name: 'id', required: true, description: 'Subscription id' })
  update(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina la sottoscrizione tramite ID' })
  @ApiParam({ name: 'id', required: true, description: 'Subscription id' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
 