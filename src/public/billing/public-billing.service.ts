import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaPublicService } from '../prisma-public.service';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';
import { StripeService } from '../../common/stripe/stripe.service';
import { InstallmentPlan } from '../../generated/public';

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

    // Aggiorna PUBLIC (fonte di verità)
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

    // Per il momento supportiamo solo il piano annuale in unica soluzione
    if (subscription.installmentPlan !== InstallmentPlan.ONE_SHOT) {
      throw new BadRequestException(
        'Al momento è supportato solo il piano annuale con pagamento in un\'unica soluzione',
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

    const successUrl = `${baseUrl.replace(/\/+$/, '')}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl.replace(/\/+$/, '')}/billing/canceled`;

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
}
