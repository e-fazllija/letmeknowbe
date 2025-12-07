import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { Request } from 'express';
import { BillingService } from './billing.service';

@ApiTags('tenant-billing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenant')
export class BillingController {
  constructor(private service: BillingService) {}

  @Get('billing/profile')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Profilo di fatturazione (tenant)' })
  getProfile(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.getProfile(clientId);
  }

  @Put('billing/profile')
  @Roles('ADMIN')
  updateProfile(@Req() req: Request, @Body() body: any) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.updateProfile(clientId, body);
  }

  @Get('subscription')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Stato sottoscrizione (tenant wrapper)' })
  getSubscription(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.getSubscription(clientId);
  }

  @Put('subscription')
  @Roles('ADMIN')
  updateSubscription(@Req() req: Request, @Body() body: any) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.updateSubscription(clientId, body);
  }

  @Get('payment-method')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Metodo di pagamento (mascherato)' })
  getPaymentMethod(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.getPaymentMethod(clientId);
  }

  @Put('payment-method')
  @Roles('ADMIN')
  updatePaymentMethod(@Req() req: Request, @Body() body: any) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.updatePaymentMethod(clientId, body);
  }

  @Get('billing/status')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Stato sintetico billing/tenant (lock)',
    description:
      'Ritorna clientStatus/subscriptionStatus e se il tenant è bloccato per pagamento (PENDING_PAYMENT o SUSPENDED).',
  })
  getBillingStatus(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.getBillingStatus(clientId);
  }
}

