import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe | null;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      this.stripe = null;
      return;
    }

    const apiVersion = process.env.STRIPE_API_VERSION;
    this.stripe = new Stripe(
      secretKey,
      apiVersion ? { apiVersion: apiVersion as any } : {},
    );
  }

  private get client(): Stripe {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe non configurato (STRIPE_SECRET_KEY mancante)',
      );
    }
    return this.stripe;
  }

  /**
   * Accesso diretto al client Stripe SDK.
   * Usare per creare Checkout/Portal session, Subscription, ecc.
   */
  get sdk(): Stripe {
    return this.client;
  }

  /**
   * Verifica e costruisce un evento webhook Stripe a partire dal raw body.
   */
  constructWebhookEvent(
    payload: Buffer,
    signature: string,
    overrideSecret?: string,
  ): Stripe.Event {
    const secret =
      overrideSecret || process.env.STRIPE_WEBHOOK_SECRET || undefined;
    if (!secret) {
      throw new InternalServerErrorException(
        'Stripe webhook non configurato (STRIPE_WEBHOOK_SECRET mancante)',
      );
    }
    return this.client.webhooks.constructEvent(payload, signature, secret);
  }
}

