import { Injectable, Logger } from '@nestjs/common';
import { PrismaPublicService } from '../prisma-public.service';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';
import { StripeService } from '../../common/stripe/stripe.service';
import Stripe from 'stripe';
import {
  PaymentMethod as PublicPaymentMethod,
  PaymentStatus as PublicPaymentStatus,
  SubscriptionStatus as PublicSubscriptionStatus,
} from '../../generated/public';
import { SubscriptionStatus as TenantSubscriptionStatus } from '../../generated/tenant';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private prismaPublic: PrismaPublicService,
    private prismaTenant: PrismaTenantService,
    private stripe: StripeService,
  ) {}

  /**
   * Entry point principale per la gestione del webhook Stripe.
   * - verifica la firma
   * - logga l'evento in PUBLIC/TENANT
   * - applica la business logic su Subscription/Payment
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event;

    try {
      event = this.stripe.constructWebhookEvent(rawBody, signature);
    } catch (err: any) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${err?.message || err}`,
      );
      throw err;
    }

    const payload =
      event.data && (event.data as any).object
        ? (event.data as any).object
        : event;

    let dataStr: string | undefined;
    try {
      dataStr = JSON.stringify(payload);
      if (dataStr.length > 8000) {
        dataStr = dataStr.slice(0, 8000);
      }
    } catch {
      dataStr = undefined;
    }

    // Scrivi log nel PUBLIC (fonte di verità) come non ancora processato
    let publicLogId: string | null = null;
    try {
      const log = await (this.prismaPublic as any).stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          data: dataStr,
          processed: false,
        },
      });
      publicLogId = log.id;
    } catch (e: any) {
      // P2002 = evento già presente, ignora
      if (e?.code !== 'P2002') {
        this.logger.error('Errore salvataggio StripeWebhookEvent (PUBLIC)', e);
      }
    }

    // Shadow log anche nel TENANT (best effort), non ancora processato
    let tenantLogId: string | null = null;
    try {
      const log = await (this.prismaTenant as any).stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          data: dataStr,
          processed: false,
        },
      });
      tenantLogId = log.id;
    } catch (e: any) {
      if (e?.code !== 'P2002') {
        this.logger.error('Errore salvataggio StripeWebhookEvent (TENANT)', e);
      }
    }

    // Business logic: aggiorna Subscription/Payment in base al tipo evento
    try {
      await this.processBusinessEvent(event);

      // Marca come processed (best effort, non blocca la risposta)
      if (publicLogId) {
        await (this.prismaPublic as any).stripeWebhookEvent.update({
          where: { id: publicLogId },
          data: { processed: true, processedAt: new Date(), error: null },
        });
      }
      if (tenantLogId) {
        await (this.prismaTenant as any).stripeWebhookEvent.update({
          where: { id: tenantLogId },
          data: { processed: true, processedAt: new Date(), error: null },
        });
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.logger.error(
        `Errore processing Stripe webhook event ${event.id}`,
        err,
      );

      // Prova a salvare l'errore nei log ma non blocca altri eventi
      if (publicLogId) {
        try {
          await (this.prismaPublic as any).stripeWebhookEvent.update({
            where: { id: publicLogId },
            data: { processed: false, processedAt: new Date(), error: msg },
          });
        } catch (e: any) {
          this.logger.error(
            'Errore aggiornamento StripeWebhookEvent (PUBLIC)',
            e,
          );
        }
      }
      if (tenantLogId) {
        try {
          await (this.prismaTenant as any).stripeWebhookEvent.update({
            where: { id: tenantLogId },
            data: { processed: false, processedAt: new Date(), error: msg },
          });
        } catch (e: any) {
          this.logger.error(
            'Errore aggiornamento StripeWebhookEvent (TENANT)',
            e,
          );
        }
      }

      // Rilancia per avere 500 in risposta (utile in dev)
      throw err;
    }
  }

  /**
   * Logica applicativa per gli eventi principali:
   * - checkout.session.completed: collega stripeSubscriptionId / stripeCustomerId
   * - invoice.payment_succeeded: registra Payment COMPLETED e aggiorna lastPayment
   * - invoice.payment_failed: registra Payment FAILED
   * - customer.subscription.updated: aggiorna lo stato dell'abbonamento
   */
  private async processBusinessEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(
          event.data.object as Stripe.Invoice,
        );
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
        );
        break;

      case 'customer.subscription.updated':
        await this.handleCustomerSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;

      default:
        // altri eventi al momento non hanno business logic
        this.logger.debug(`Stripe event ignorato (no-op): ${event.type}`);
    }
  }

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const subscriptionId =
      (session.metadata?.subscriptionId as string | undefined) || undefined;
    const clientId =
      (session.metadata?.clientId as string | undefined) ||
      (session.client_reference_id as string | undefined) ||
      undefined;

    if (!subscriptionId && !clientId) {
      this.logger.warn(
        'checkout.session.completed senza subscriptionId/clientId nei metadata',
      );
      return;
    }

    // Recupera la Subscription PUBLIC
    let publicSub: any;
    if (subscriptionId) {
      publicSub = await (this.prismaPublic as any).subscription.findUnique({
        where: { id: subscriptionId },
      });
    } else if (clientId) {
      publicSub = await (this.prismaPublic as any).subscription.findFirst({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!publicSub) {
      this.logger.warn(
        `Nessuna Subscription trovata per checkout.session.completed (subscriptionId=${subscriptionId}, clientId=${clientId})`,
      );
      return;
    }

    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : undefined;
    const stripeCustomerId =
      typeof session.customer === 'string' ? session.customer : undefined;

    const updateData: any = {};
    if (stripeSubscriptionId) {
      updateData.stripeSubscriptionId = stripeSubscriptionId;
    }
    if (stripeCustomerId) {
      updateData.stripeCustomerId = stripeCustomerId;
    }

    if (Object.keys(updateData).length === 0) {
      return;
    }

    const updatedPublicSub = await (this.prismaPublic as any).subscription.update(
      {
        where: { id: publicSub.id },
        data: updateData,
      },
    );

    // Shadow update nel TENANT (best effort)
    try {
      await (this.prismaTenant as any).subscription.update({
        where: { id: publicSub.id },
        data: {
          stripeSubscriptionId: updatedPublicSub.stripeSubscriptionId,
          stripeCustomerId: updatedPublicSub.stripeCustomerId,
        },
      });
    } catch (e: any) {
      if (e?.code !== 'P2025') {
        this.logger.error(
          'Errore aggiornamento Subscription (TENANT) da checkout.session.completed',
          e,
        );
      }
    }
  }

  private async handleInvoicePaymentSucceeded(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const stripeCustomerId =
      (invoice.customer as string | null | undefined) || undefined;
    const stripeSubscriptionId =
      (invoice.subscription as string | null | undefined) || undefined;

    if (!stripeCustomerId) {
      this.logger.warn(
        `invoice.payment_succeeded senza customer collegato (invoice=${invoice.id})`,
      );
      return;
    }

    // Trova il Client PUBLIC partendo dallo Stripe customer
    const client = await (this.prismaPublic as any).client.findFirst({
      where: { stripeCustomerId },
      select: { id: true },
    });

    if (!client) {
      this.logger.warn(
        `invoice.payment_succeeded: nessun Client trovato per stripeCustomerId=${stripeCustomerId}`,
      );
      return;
    }

    // Trova la Subscription PUBLIC collegata (prima per stripeSubscriptionId, fallback su clientId)
    let subscription: any = null;
    if (stripeSubscriptionId) {
      subscription = await (this.prismaPublic as any).subscription.findFirst({
        where: { stripeSubscriptionId },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (!subscription) {
      subscription = await (this.prismaPublic as any).subscription.findFirst({
        where: { clientId: client.id },
        orderBy: { createdAt: 'desc' },
      });
    }

    const amountCents = invoice.amount_paid ?? invoice.total;
    if (!amountCents) {
      this.logger.warn(
        `invoice.payment_succeeded senza amount (invoice=${invoice.id})`,
      );
      return;
    }

    const amount = amountCents / 100;
    const currency = (invoice.currency || 'EUR').toUpperCase();

    const paidAtSec =
      invoice.status_transitions?.paid_at || invoice.created || undefined;
    const paymentDate = paidAtSec ? new Date(paidAtSec * 1000) : undefined;

    const stripeInvoiceId = invoice.id;
    const stripePaymentIntentId =
      (invoice.payment_intent as string | null | undefined) || undefined;
    const stripeChargeId =
      (invoice.charge as string | null | undefined) || undefined;

    // Idempotenza: se esiste già un Payment per questa invoice, aggiorna
    let publicPayment = await (this.prismaPublic as any).payment.findFirst({
      where: { stripeInvoiceId },
    });

    if (publicPayment) {
      publicPayment = await (this.prismaPublic as any).payment.update({
        where: { id: publicPayment.id },
        data: {
          subscriptionId: subscription?.id ?? publicPayment.subscriptionId,
          amount,
          currency,
          status: PublicPaymentStatus.COMPLETED,
          method: PublicPaymentMethod.CARTA,
          paymentDate: paymentDate ?? publicPayment.paymentDate,
          stripePaymentIntentId,
          stripeInvoiceId,
          stripeChargeId,
        },
      });
    } else {
      publicPayment = await (this.prismaPublic as any).payment.create({
        data: {
          clientId: client.id,
          subscriptionId: subscription?.id,
          amount,
          currency,
          status: PublicPaymentStatus.COMPLETED,
          method: PublicPaymentMethod.CARTA,
          paymentDate,
          stripePaymentIntentId,
          stripeInvoiceId,
          stripeChargeId,
        },
      });
    }

    // Aggiorna Subscription.lastPaymentId (se esiste una subscription)
    if (subscription) {
      const nextBillingAt =
        invoice.next_payment_attempt != null
          ? new Date(invoice.next_payment_attempt * 1000)
          : subscription.nextBillingAt;

      const publicSubUpdated = await (this.prismaPublic as any).subscription.update(
        {
          where: { id: subscription.id },
          data: {
            lastPaymentId: publicPayment.id,
            status: PublicSubscriptionStatus.ACTIVE,
            nextBillingAt,
          },
        },
      );

      // Shadow update nel TENANT (subscription)
      try {
        await (this.prismaTenant as any).subscription.update({
          where: { id: subscription.id },
          data: {
            lastPaymentId: publicPayment.id,
            status: TenantSubscriptionStatus.ACTIVE,
            nextBillingAt: publicSubUpdated.nextBillingAt,
          },
        });
      } catch (e: any) {
        if (e?.code !== 'P2025') {
          this.logger.error(
            'Errore aggiornamento Subscription (TENANT) da invoice.payment_succeeded',
            e,
          );
        }
      }
    }

    // Shadow Payment nel TENANT (best effort)
    try {
      await (this.prismaTenant as any).payment.upsert({
        where: { id: publicPayment.id },
        update: {
          clientId: publicPayment.clientId,
          subscriptionId: publicPayment.subscriptionId,
          amount: publicPayment.amount as any,
          currency: publicPayment.currency,
          status: publicPayment.status as any,
          method: publicPayment.method as any,
          dueDate: publicPayment.dueDate ?? undefined,
          paymentDate: publicPayment.paymentDate ?? undefined,
          stripePaymentIntentId: publicPayment.stripePaymentIntentId,
          stripeInvoiceId: publicPayment.stripeInvoiceId,
          stripeChargeId: publicPayment.stripeChargeId,
        },
        create: {
          id: publicPayment.id,
          clientId: publicPayment.clientId,
          subscriptionId: publicPayment.subscriptionId,
          amount: publicPayment.amount as any,
          currency: publicPayment.currency,
          status: publicPayment.status as any,
          method: publicPayment.method as any,
          dueDate: publicPayment.dueDate ?? undefined,
          paymentDate: publicPayment.paymentDate ?? undefined,
          stripePaymentIntentId: publicPayment.stripePaymentIntentId,
          stripeInvoiceId: publicPayment.stripeInvoiceId,
          stripeChargeId: publicPayment.stripeChargeId,
        },
      });
    } catch (e: any) {
      this.logger.error(
        'Errore sync Payment (TENANT) da invoice.payment_succeeded',
        e,
      );
    }
  }

  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const stripeCustomerId =
      (invoice.customer as string | null | undefined) || undefined;

    if (!stripeCustomerId) {
      this.logger.warn(
        `invoice.payment_failed senza customer collegato (invoice=${invoice.id})`,
      );
      return;
    }

    const client = await (this.prismaPublic as any).client.findFirst({
      where: { stripeCustomerId },
      select: { id: true },
    });

    if (!client) {
      this.logger.warn(
        `invoice.payment_failed: nessun Client trovato per stripeCustomerId=${stripeCustomerId}`,
      );
      return;
    }

    const stripeInvoiceId = invoice.id;

    // Trova eventuale Payment per la stessa invoice e marca FAILED; altrimenti crealo
    let publicPayment = await (this.prismaPublic as any).payment.findFirst({
      where: { stripeInvoiceId },
    });

    const amountCents = invoice.amount_due ?? invoice.total ?? undefined;
    const amount = amountCents ? amountCents / 100 : undefined;
    const currency = (invoice.currency || 'EUR').toUpperCase();

    if (publicPayment) {
      publicPayment = await (this.prismaPublic as any).payment.update({
        where: { id: publicPayment.id },
        data: {
          status: PublicPaymentStatus.FAILED,
        },
      });
    } else if (amount !== undefined) {
      publicPayment = await (this.prismaPublic as any).payment.create({
        data: {
          clientId: client.id,
          amount,
          currency,
          status: PublicPaymentStatus.FAILED,
          method: PublicPaymentMethod.CARTA,
          stripeInvoiceId,
        },
      });
    } else {
      this.logger.warn(
        `invoice.payment_failed senza amount, Payment non creato (invoice=${invoice.id})`,
      );
      return;
    }

    // Shadow Payment nel TENANT (best effort)
    try {
      await (this.prismaTenant as any).payment.upsert({
        where: { id: publicPayment.id },
        update: {
          clientId: publicPayment.clientId,
          subscriptionId: publicPayment.subscriptionId,
          amount: publicPayment.amount as any,
          currency: publicPayment.currency,
          status: publicPayment.status as any,
          method: publicPayment.method as any,
          dueDate: publicPayment.dueDate ?? undefined,
          paymentDate: publicPayment.paymentDate ?? undefined,
          stripePaymentIntentId: publicPayment.stripePaymentIntentId,
          stripeInvoiceId: publicPayment.stripeInvoiceId,
          stripeChargeId: publicPayment.stripeChargeId,
        },
        create: {
          id: publicPayment.id,
          clientId: publicPayment.clientId,
          subscriptionId: publicPayment.subscriptionId,
          amount: publicPayment.amount as any,
          currency: publicPayment.currency,
          status: publicPayment.status as any,
          method: publicPayment.method as any,
          dueDate: publicPayment.dueDate ?? undefined,
          paymentDate: publicPayment.paymentDate ?? undefined,
          stripePaymentIntentId: publicPayment.stripePaymentIntentId,
          stripeInvoiceId: publicPayment.stripeInvoiceId,
          stripeChargeId: publicPayment.stripeChargeId,
        },
      });
    } catch (e: any) {
      this.logger.error(
        'Errore sync Payment (TENANT) da invoice.payment_failed',
        e,
      );
    }
  }

  private async handleCustomerSubscriptionUpdated(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const stripeSubscriptionId = stripeSub.id;

    const mappedStatus = this.mapStripeSubscriptionStatus(stripeSub.status);

    // Stima nextBillingAt / endsAt in base alle informazioni Stripe
    const currentPeriodEndSec = stripeSub.current_period_end || undefined;
    const cancelAtSec = stripeSub.cancel_at || stripeSub.ended_at || undefined;

    const nextBillingAt =
      currentPeriodEndSec && mappedStatus === PublicSubscriptionStatus.ACTIVE
        ? new Date(currentPeriodEndSec * 1000)
        : undefined;
    const endsAt =
      cancelAtSec && mappedStatus !== PublicSubscriptionStatus.ACTIVE
        ? new Date(cancelAtSec * 1000)
        : undefined;

    // Aggiorna la Subscription PUBLIC
    const publicSub = await (this.prismaPublic as any).subscription.findFirst({
      where: { stripeSubscriptionId },
      orderBy: { createdAt: 'desc' },
    });

    if (!publicSub) {
      this.logger.warn(
        `customer.subscription.updated: nessuna Subscription trovata per stripeSubscriptionId=${stripeSubscriptionId}`,
      );
      return;
    }

    const publicSubUpdated = await (this.prismaPublic as any).subscription.update(
      {
        where: { id: publicSub.id },
        data: {
          status: mappedStatus,
          nextBillingAt: nextBillingAt ?? publicSub.nextBillingAt,
          endsAt: endsAt ?? publicSub.endsAt,
        },
      },
    );

    // Shadow update nel TENANT
    try {
      await (this.prismaTenant as any).subscription.update({
        where: { id: publicSub.id },
        data: {
          status: this.mapStripeSubscriptionStatusTenant(stripeSub.status),
          nextBillingAt: publicSubUpdated.nextBillingAt,
          endsAt: publicSubUpdated.endsAt,
        },
      });
    } catch (e: any) {
      if (e?.code !== 'P2025') {
        this.logger.error(
          'Errore aggiornamento Subscription (TENANT) da customer.subscription.updated',
          e,
        );
      }
    }
  }

  private mapStripeSubscriptionStatus(
    status: Stripe.Subscription.Status,
  ): PublicSubscriptionStatus {
    switch (status) {
      case 'active':
        return PublicSubscriptionStatus.ACTIVE;
      case 'trialing':
        return PublicSubscriptionStatus.TRIALING;
      case 'past_due':
      case 'unpaid':
        return PublicSubscriptionStatus.PAST_DUE;
      case 'canceled':
        return PublicSubscriptionStatus.CANCELED;
      case 'incomplete_expired':
      case 'incomplete':
        return PublicSubscriptionStatus.EXPIRED;
      default:
        return PublicSubscriptionStatus.ACTIVE;
    }
  }

  private mapStripeSubscriptionStatusTenant(
    status: Stripe.Subscription.Status,
  ): TenantSubscriptionStatus {
    switch (status) {
      case 'active':
        return TenantSubscriptionStatus.ACTIVE;
      case 'trialing':
        return TenantSubscriptionStatus.TRIALING;
      case 'past_due':
      case 'unpaid':
        return TenantSubscriptionStatus.PAST_DUE;
      case 'canceled':
        return TenantSubscriptionStatus.CANCELED;
      case 'incomplete_expired':
      case 'incomplete':
        return TenantSubscriptionStatus.EXPIRED;
      default:
        return TenantSubscriptionStatus.ACTIVE;
    }
  }
}

