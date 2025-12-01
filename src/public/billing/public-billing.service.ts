import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaPublicService } from '../prisma-public.service';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';
import { StripeService } from '../../common/stripe/stripe.service';
import {
  InstallmentPlan,
  SubscriptionStatus as PublicSubscriptionStatus,
} from '../../generated/public';
import Stripe from 'stripe';

@Injectable()
export class PublicBillingService {
  constructor(
    private prismaPublic: PrismaPublicService,
    private prismaTenant: PrismaTenantService,
    private stripe: StripeService,
  ) {}

  private async ensureStripeCustomer(clientId: string): Promise<string> {
    const client = await this.prismaPublic.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        companyName: true,
        contactEmail: true,
        stripeCustomerId: true,
      },
    });

    if (!client) {
      throw new BadRequestException('Client non trovato');
    }

    if (client.stripeCustomerId) {
      return client.stripeCustomerId;
    }

    const customer = await this.stripe.sdk.customers.create({
      name: client.companyName,
      email: client.contactEmail,
      metadata: { clientId: client.id },
    });

    const stripeCustomerId = customer.id;

    // Aggiorna PUBLIC (fonte di verita)
    await this.prismaPublic.client.update({
      where: { id: client.id },
      data: { stripeCustomerId },
    });

    // Prova ad aggiornare anche il TENANT (shadow), ma non fallire l'operazione per P2025
    try {
      await this.prismaTenant.client.update({
        where: { id: client.id },
        data: { stripeCustomerId },
      });
    } catch (e: any) {
      if (e?.code !== 'P2025') {
        throw e;
      }
    }

    return stripeCustomerId;
  }

  private async createOrReuseInlinePaymentIntent({
    subscription,
    priceId,
    clientId,
    stripeCustomerId,
  }: {
    subscription: { id: string; stripeSubscriptionId?: string | null };
    priceId: string;
    clientId: string;
    stripeCustomerId: string;
  }): Promise<{
    paymentIntent: Stripe.PaymentIntent;
    stripeSubscriptionId: string;
    reused: boolean;
  }> {
    // Se esiste gia una subscription Stripe, prova a riutilizzare il PaymentIntent incompleto
    if (subscription.stripeSubscriptionId) {
      try {
        const existingSub = await this.stripe.sdk.subscriptions.retrieve(
          subscription.stripeSubscriptionId,
          { expand: ['latest_invoice.payment_intent'] } as any,
        );
        const invoice = existingSub.latest_invoice as
          | Stripe.Invoice
          | null
          | undefined;
        const paymentIntent = invoice?.payment_intent as
          | Stripe.PaymentIntent
          | null
          | undefined;

        if (paymentIntent?.status === 'succeeded') {
          throw new BadRequestException(
            'Il pagamento risulta gia completato per questo abbonamento',
          );
        }

        if (paymentIntent && paymentIntent.status !== 'canceled') {
          return {
            paymentIntent,
            stripeSubscriptionId: existingSub.id,
            reused: true,
          };
        }
      } catch (err: any) {
        // 404: subscription non trovata su Stripe, creane una nuova
        if (err?.statusCode !== 404) {
          throw err;
        }
      }
    }

    const stripeSub = await this.stripe.sdk.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        clientId,
        subscriptionId: subscription.id,
      },
    });

    const invoice = stripeSub.latest_invoice as Stripe.Invoice | null | undefined;
    const paymentIntent = invoice?.payment_intent as
      | Stripe.PaymentIntent
      | null
      | undefined;

    if (!paymentIntent?.client_secret) {
      throw new BadRequestException(
        'Impossibile creare un Payment Intent per il piano selezionato',
      );
    }

    return {
      paymentIntent,
      stripeSubscriptionId: stripeSub.id,
      reused: false,
    };
  }

  /**
   * Crea una Checkout Session Stripe per il piano corrente del tenant.
   * Usa l'ultima Subscription PUBLIC del client e il relativo SubscriptionPlan.
   */
  async createCheckoutSession(clientId: string) {
    if (!clientId) {
      throw new BadRequestException('Tenant non valido');
    }

    const subscription = await this.prismaPublic.subscription.findFirst({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    if (!subscription || !subscription.plan) {
      throw new BadRequestException(
        'Nessuna subscription configurata per questo tenant',
      );
    }

    // Impedisci nuove Checkout Session se l'abbonamento è già attivo / trial / in tolleranza
    const blockedStatuses: PublicSubscriptionStatus[] = [
      PublicSubscriptionStatus.ACTIVE,
      PublicSubscriptionStatus.TRIALING,
      PublicSubscriptionStatus.PAST_DUE,
    ];

    if (blockedStatuses.includes(subscription.status as PublicSubscriptionStatus)) {
      throw new BadRequestException(
        'Hai già un abbonamento attivo o in rinnovo: gestisci pagamenti e fatture dal Customer Portal.',
      );
    }

    // Per il momento supportiamo solo il piano annuale in unica soluzione
    if (subscription.installmentPlan !== InstallmentPlan.ONE_SHOT) {
      throw new BadRequestException(
        'Al momento e supportato solo il piano annuale con pagamento in un\'unica soluzione',
      );
    }

    const { plan } = subscription;

    const priceId: string | null = plan.stripePriceOneShotId || null;

    if (!priceId) {
      throw new BadRequestException(
        'Piano Stripe non configurato per questa rateizzazione',
      );
    }

    const customerId = await this.ensureStripeCustomer(clientId);

    const baseUrl =
      process.env.FRONTEND_BASE_URL ||
      process.env.API_BASE_URL ||
      'http://localhost:3000';

    // HashRouter nel FE: includi #/ per far montare correttamente la route
    const baseClean = baseUrl.replace(/\/+$/, '');
    const successUrl = `${baseClean}/#/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseClean}/#/billing/canceled`;

    try {
      const session = await this.stripe.sdk.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: clientId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: {
          metadata: {
            clientId,
            subscriptionId: subscription.id,
          },
        },
        metadata: {
          clientId,
          subscriptionId: subscription.id,
        },
      });

      if (!session.url) {
        throw new BadRequestException(
          'Impossibile creare una Checkout Session Stripe',
        );
      }

      return { url: session.url };
    } catch (e: any) {
      // Espone l'errore Stripe come 400 leggibile lato client
      // eslint-disable-next-line no-console
      console.error('Stripe checkout.session error', e);
      const msg =
        (e && typeof e.message === 'string' && e.message) ||
        'Errore creazione Checkout Session Stripe';
      throw new BadRequestException(msg);
    }
  }

  /**
   * Crea una Customer Portal Session per permettere al tenant di gestire il pagamento.
   */
  async createPortalSession(clientId: string) {
    if (!clientId) {
      throw new BadRequestException('Tenant non valido');
    }

    const customerId = await this.ensureStripeCustomer(clientId);

    const baseUrl =
      process.env.FRONTEND_BASE_URL ||
      process.env.API_BASE_URL ||
      'http://localhost:3000';

    const returnUrl = `${baseUrl.replace(/\/+$/, '')}/settings/billing`;

    try {
      const portalSession =
        await this.stripe.sdk.billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl,
        });

      if (!portalSession.url) {
        throw new BadRequestException(
          'Impossibile creare una Portal Session Stripe',
        );
      }

      return { url: portalSession.url };
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('Stripe billingPortal.session error', e);
      const msg =
        (e && typeof e.message === 'string' && e.message) ||
        'Errore creazione Portal Session Stripe';
      throw new BadRequestException(msg);
    }
  }

  /**
   * Prepara un PaymentIntent per permettere il pagamento inline via Stripe Payment Element
   * senza redirect/nuove finestre.
   */
  async createInlinePaymentIntent(clientId: string) {
    if (!clientId) {
      throw new BadRequestException('Tenant non valido');
    }

    const subscription = await this.prismaPublic.subscription.findFirst({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    if (!subscription || !subscription.plan) {
      throw new BadRequestException(
        'Nessuna subscription configurata per questo tenant',
      );
    }

    if (subscription.installmentPlan !== InstallmentPlan.ONE_SHOT) {
      throw new BadRequestException(
        "Al momento e supportato solo il piano annuale con pagamento in un'unica soluzione",
      );
    }

    const priceId: string | null = subscription.plan.stripePriceOneShotId || null;

    if (!priceId) {
      throw new BadRequestException(
        'Piano Stripe non configurato per questa rateizzazione',
      );
    }

    const stripeCustomerId = await this.ensureStripeCustomer(clientId);

    const { paymentIntent, stripeSubscriptionId, reused } =
      await this.createOrReuseInlinePaymentIntent({
        subscription,
        priceId,
        clientId,
        stripeCustomerId,
      });

    // Aggiorna PUBLIC/TENANT con gli id Stripe della subscription creata o riutilizzata
    if (
      subscription.stripeSubscriptionId !== stripeSubscriptionId ||
      subscription.stripeCustomerId !== stripeCustomerId
    ) {
      await this.prismaPublic.subscription.update({
        where: { id: subscription.id },
        data: {
          stripeSubscriptionId,
          stripeCustomerId,
        },
      });

      try {
        await this.prismaTenant.subscription.update({
          where: { id: subscription.id },
          data: {
            stripeSubscriptionId,
            stripeCustomerId,
          },
        });
      } catch (e: any) {
        if (e?.code !== 'P2025') {
          throw e;
        }
      }
    }

    // Arricchisci il PaymentIntent con metadata utili per il debug (best effort)
    try {
      await this.stripe.sdk.paymentIntents.update(paymentIntent.id, {
        metadata: {
          clientId,
          subscriptionId: subscription.id,
        },
      });
    } catch (e) {
      // non bloccare il flusso inline se il metadata non viene aggiornato
    }

    const baseUrl =
      process.env.FRONTEND_BASE_URL ||
      process.env.API_BASE_URL ||
      'http://localhost:3000';
    const returnUrl = `${baseUrl.replace(/\/+$/, '')}/settings/billing`;

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      stripeSubscriptionId,
      stripeCustomerId,
      amount:
        typeof paymentIntent.amount === 'number'
          ? paymentIntent.amount / 100
          : undefined,
      currency: paymentIntent.currency
        ? paymentIntent.currency.toUpperCase()
        : subscription.plan.currency || 'EUR',
      status: paymentIntent.status,
      reused,
      returnUrl,
    };
  }
}
