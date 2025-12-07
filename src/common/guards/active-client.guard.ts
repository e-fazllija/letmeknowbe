import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';

@Injectable()
export class ActiveClientGuard implements CanActivate {
  constructor(private readonly prismaTenant: PrismaTenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req?.user as { clientId?: string } | undefined;
    const clientId = user?.clientId;

    if (!clientId) {
      throw new ForbiddenException('Tenant non valido per questa richiesta');
    }

    const client = await (this.prismaTenant as any).client.findUnique({
      where: { id: clientId },
      select: { status: true },
    });

    if (!client) {
      throw new ForbiddenException('Tenant non trovato');
    }

    const status = ((client.status as any) || '').toString().toUpperCase();

    // Consentito solo se il tenant è ACTIVE.
    // PENDING_PAYMENT: nuovo tenant che non ha ancora completato il primo pagamento
    // SUSPENDED: rinnovi non pagati oltre la tolleranza
    // ARCHIVED: account chiuso (dati mantenuti)
    if (status === 'ACTIVE') {
      return true;
    }

    if (status === 'PENDING_PAYMENT') {
      // Prova a capire se esiste un tentativo di pagamento FALLITO per
      // mostrare un messaggio più esplicito al tenant.
      const lastPayment = await (this.prismaTenant as any).payment.findFirst({
        where: { clientId },
        orderBy: [
          { paymentDate: 'desc' as any },
          { createdAt: 'desc' as any },
        ],
        select: {
          status: true,
        },
      });

      const lastPaymentStatus = (
        (lastPayment?.status as any) || ''
      )
        .toString()
        .toUpperCase();

      if (lastPaymentStatus === 'FAILED') {
        throw new ForbiddenException(
          'Tenant in attesa di pagamento: l\'ultimo tentativo di pagamento è fallito. Riprova a completare il pagamento nella sezione fatturazione.',
        );
      }

      throw new ForbiddenException(
        'Tenant in attesa di pagamento: completa il pagamento per continuare.',
      );
    }

    if (status === 'SUSPENDED') {
      throw new ForbiddenException(
        'Tenant sospeso per mancato pagamento: aggiorna il metodo di pagamento per riattivare l\'accesso.',
      );
    }

    if (status === 'ARCHIVED') {
      throw new ForbiddenException(
        'Tenant archiviato: l\'account non è più attivo.',
      );
    }

    // Fallback prudente: blocca se lo stato non è riconosciuto
    throw new ForbiddenException('Tenant non attivo.');
  }
}
