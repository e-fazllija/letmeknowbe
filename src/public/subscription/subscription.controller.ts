import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@ApiTags('public-subscriptions')
@Controller('public/subscriptions')
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  @Post('Sottoscrizione-azienda:idazienda')
  create(@Body() dto: CreateSubscriptionDto) {
    return this.service.create(dto);
  }

  @Get('Get-Sottoscrizioni')
  findAll() {
    return this.service.findAll();
  }

  @Get('Get-sottoscrizione:idsubscription')
  @ApiParam({ name: 'id', required: true })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch('Modifica-sottoscrizione:idsubscription')
  @ApiParam({ name: 'id', required: true })
  update(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.service.update(id, dto);
  }

  @Delete('Delete-sottoscrizione:idsubscription')
  @ApiParam({ name: 'id', required: true })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
 