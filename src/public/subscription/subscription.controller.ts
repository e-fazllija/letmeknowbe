import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiParam, ApiTags, ApiOperation } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@ApiTags('public-subscriptions')
@Controller('public/subscriptions')
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  @Post('Sottoscrizione-azienda:idazienda')
  @ApiOperation({ summary: 'Crea la sottoscrizione dell azienda tramite clientid' })
  create(@Body() dto: CreateSubscriptionDto) {
    return this.service.create(dto);
  }

  @Get('Get-Sottoscrizioni')
  @ApiOperation({ summary: 'Ritorna tutte le sottoscrizioni delle aiende presenti nel db' })
  findAll() {
    return this.service.findAll();
  }

  @Get('Get-sottoscrizione:idsubscription')
  @ApiOperation({ summary: 'Ritorna la sottoscrizione desiderata tramite id della subscription' })
  @ApiParam({ name: 'id', required: true })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch('Modifica-sottoscrizione:idsubscription')
   @ApiOperation({ summary: 'Modifica la sottoscrizione desiderata tramite id della subscription' })
  @ApiParam({ name: 'id', required: true })
  update(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.service.update(id, dto);
  }

  @Delete('Delete-sottoscrizione:idsubscription')
   @ApiOperation({ summary: 'Elimina la sottoscrizione desiderata tramite id della subscription' })
  @ApiParam({ name: 'id', required: true })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
 