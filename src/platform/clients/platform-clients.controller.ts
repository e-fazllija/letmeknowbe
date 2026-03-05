import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformClientsService } from './platform-clients.service';
import { PlatformJwtGuard } from '../guards/platform-jwt.guard';

@ApiTags('platform-clients')
@ApiBearerAuth('access-token')
@UseGuards(PlatformJwtGuard)
@Controller('platform/clients')
export class PlatformClientsController {
  constructor(private readonly service: PlatformClientsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista Client (PUBLIC) con subscriptions' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id/subscriptions')
  @ApiOperation({ summary: 'Sottoscrizioni con ultimo metodo di pagamento' })
  findSubscriptions(@Param('id') id: string) {
    return this.service.findSubscriptions(id);
  }

  @Get(':id/invoices')
  @ApiOperation({ summary: 'Fatture e ricevute Stripe per client' })
  findInvoices(@Param('id') id: string) {
    return this.service.findInvoices(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio Client (PUBLIC) con subscriptions' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}

