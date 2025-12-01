import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PublicBillingService } from './public-billing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('public-billing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('public/billing')
export class PublicBillingController {
  constructor(private service: PublicBillingService) {}

  @Post('checkout-session')
  @ApiOperation({
    summary: 'Crea una Stripe Checkout Session per il piano corrente',
    description:
      'Richiede un access token tenant. Usa la subscription PUBLIC corrente del client per determinare il piano e la rateizzazione.',
  })
  createCheckoutSession(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.createCheckoutSession(clientId);
  }

  @Post('payment-intent')
  @ApiOperation({
    summary: 'Prepara un PaymentIntent per il pagamento inline',
    description:
      'Richiede un access token tenant. Restituisce il client secret da usare con Stripe Payment Element senza aprire nuove finestre.',
  })
  createPaymentIntent(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.createInlinePaymentIntent(clientId);
  }

  @Post('portal-session')
  @ApiOperation({
    summary: 'Crea una Stripe Customer Portal Session',
    description:
      'Richiede un access token tenant. Permette al tenant di gestire carta, fatture e cancellazione piano via Stripe Customer Portal.',
  })
  createPortalSession(@Req() req: Request) {
    const clientId = (req as any)?.user?.clientId as string;
    return this.service.createPortalSession(clientId);
  }
}
