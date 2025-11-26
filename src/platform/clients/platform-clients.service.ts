import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaPublicService } from '../../public/prisma-public.service';
import { StripeService } from '../../common/stripe/stripe.service';
import {
  PaymentMethod as PublicPaymentMethod,
  PaymentStatus as PublicPaymentStatus,
} from '../../generated/public';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';

@Injectable()
export class PlatformClientsService {
  constructor(
    private readonly publicPrisma: PrismaPublicService,
    private readonly stripe: StripeService,
    private readonly tenantPrisma: PrismaTenantService,
  ) {}

  findAll() {
    return this.publicPrisma.client.findMany({
      include: { subscriptions: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const client = await this.publicPrisma.client.findUnique({
      where: { id },
      include: { subscriptions: true },
    });
    if (!client) throw new NotFoundException('Client non trovato');
    return client;
  }

  async findInvoices(id: string) {
    const client = await this.publicPrisma.client.findUnique({
      where: { id },
      select: { id: true, stripeCustomerId: true },
    });

    if (!client) throw new NotFoundException('Client non trovato');

    const stripeCustomerId = client.stripeCustomerId;

    // Se non abbiamo un customer Stripe associato, non possiamo leggere da Stripe; restituiamo eventuali dati locali
    if (!stripeCustomerId) {
      return (this.publicPrisma as any).payment.findMany({
        where: { clientId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    }

    const invoices: any[] = [];
    // Usa autopaginazione Stripe per recuperare fino a 100 fatture (modificabile)
    for await (const inv of this.stripe.sdk.invoices.list(
      {
        customer: stripeCustomerId,
        limit: 100,
      },
      { stripeAccount: undefined },
    ) as any) {
      const paymentIntentId =
        (inv.payment_intent as string | null | undefined) || undefined;
      let stripeChargeId =
        (inv.charge as string | null | undefined) || undefined;
      let receiptUrl: string | undefined;

      if (!stripeChargeId && paymentIntentId) {
        try {
          const charges = await this.stripe.sdk.charges.list({
            payment_intent: paymentIntentId,
            limit: 1,
          });
          stripeChargeId = charges.data[0]?.id || undefined;
        } catch {
          // best effort
        }
      }

      if (stripeChargeId) {
        try {
          const charge = await this.stripe.sdk.charges.retrieve(
            stripeChargeId,
          );
          receiptUrl = charge.receipt_url ?? undefined;
        } catch {
          // best effort
        }
      }

      const amountCents = inv.amount_paid ?? inv.amount_due ?? inv.total ?? 0;
      const paymentDateSec =
        inv.status_transitions?.paid_at || inv.created || undefined;
      const dueDateSec = inv.due_date || undefined;

      const amount = amountCents != null ? amountCents / 100 : null;
      const paymentDate = paymentDateSec
        ? new Date(paymentDateSec * 1000)
        : undefined;
      const dueDate = dueDateSec ? new Date(dueDateSec * 1000) : undefined;
      const status = this.mapStripeInvoiceStatus(inv.status);

      // Aggiorna/crea Payment nel DB (PUBLIC + TENANT best effort)
      try {
        await (this.publicPrisma as any).payment.upsert({
          where: { stripeInvoiceId: inv.id },
          update: {
            clientId: id,
            amount,
            currency: (inv.currency || 'EUR').toUpperCase(),
            status: status,
            method: PublicPaymentMethod.CARTA,
            paymentDate: paymentDate ?? undefined,
            dueDate: dueDate ?? undefined,
            stripePaymentIntentId: paymentIntentId,
            stripeInvoiceId: inv.id,
            stripeChargeId,
          },
          create: {
            clientId: id,
            amount,
            currency: (inv.currency || 'EUR').toUpperCase(),
            status: status,
            method: PublicPaymentMethod.CARTA,
            paymentDate: paymentDate ?? undefined,
            dueDate: dueDate ?? undefined,
            stripePaymentIntentId: paymentIntentId,
            stripeInvoiceId: inv.id,
            stripeChargeId,
          },
        });
      } catch {
        // best effort
      }

      try {
        await (this.tenantPrisma as any).payment.upsert({
          where: { stripeInvoiceId: inv.id },
          update: {
            clientId: id,
            amount,
            currency: (inv.currency || 'EUR').toUpperCase(),
            status: status,
            method: PublicPaymentMethod.CARTA,
            paymentDate: paymentDate ?? undefined,
            dueDate: dueDate ?? undefined,
            stripePaymentIntentId: paymentIntentId,
            stripeInvoiceId: inv.id,
            stripeChargeId,
          },
          create: {
            clientId: id,
            amount,
            currency: (inv.currency || 'EUR').toUpperCase(),
            status: status,
            method: PublicPaymentMethod.CARTA,
            paymentDate: paymentDate ?? undefined,
            dueDate: dueDate ?? undefined,
            stripePaymentIntentId: paymentIntentId,
            stripeInvoiceId: inv.id,
            stripeChargeId,
          },
        });
      } catch {
        // best effort
      }

      invoices.push({
        id: inv.id,
        amount,
        currency: (inv.currency || 'EUR').toUpperCase(),
        status: status,
        paymentDate: paymentDate ? paymentDate.toISOString() : undefined,
        dueDate: dueDate ? dueDate.toISOString() : null,
        createdAt: inv.created
          ? new Date(inv.created * 1000).toISOString()
          : undefined,
        stripeInvoiceId: inv.id,
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId,
        invoicePdf: inv.invoice_pdf ?? undefined,
        invoiceUrl: inv.hosted_invoice_url ?? undefined,
        invoiceNumber: inv.number ?? undefined,
        receiptUrl,
      });
    }

    return invoices;
  }

  private mapStripeInvoiceStatus(status?: string): PublicPaymentStatus {
    switch ((status || '').toLowerCase()) {
      case 'paid':
        return PublicPaymentStatus.COMPLETED;
      case 'open':
      case 'draft':
      case 'unpaid':
        return PublicPaymentStatus.PENDING;
      case 'void':
      case 'uncollectible':
        return PublicPaymentStatus.FAILED;
      default:
        return PublicPaymentStatus.PENDING;
    }
  }
}

