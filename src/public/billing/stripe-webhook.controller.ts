import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { StripeWebhookService } from './stripe-webhook.service';

@ApiTags('public-stripe-webhook')
@Controller('public/stripe')
export class StripeWebhookController {
  constructor(private service: StripeWebhookService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Webhook Stripe',
    description:
      'Endpoint per gli eventi Stripe. Verifica la firma e logga gli eventi in StripeWebhookEvent.',
  })
  async handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = (req as any).body as Buffer;
    await this.service.handleWebhook(rawBody, signature);
    return { received: true };
  }
}

