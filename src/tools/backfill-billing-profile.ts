import { PrismaClient as TenantClient } from '../generated/tenant';
import { PrismaClient as PublicClient } from '../generated/public';

async function run() {
  const tenant = new TenantClient();
  const pub = new PublicClient();

  try {
    const tenants = await tenant.client.findMany({
      select: { id: true, companyName: true },
      orderBy: { createdAt: 'asc' as any },
    });

    for (const t of tenants) {
      const pc = await (pub as any).client.findUnique({ where: { id: t.id } });
      if (!pc) continue;

      // Richiediamo almeno gli estremi minimi di billing; se mancano, salta
      if (!pc.billingTaxId || !pc.billingAddressLine1 || !pc.billingZip || !pc.billingCity || !pc.billingProvince || !pc.billingCountry || !pc.billingEmail) {
        // eslint-disable-next-line no-console
        console.warn(`Skip BillingProfile for client ${t.id}: incomplete billing data in PUBLIC`);
        continue;
      }

      await (tenant as any).client.update({
        where: { id: t.id },
        data: {
          companyName: pc.companyName,
          billingTaxId: pc.billingTaxId,
          billingAddressLine1: pc.billingAddressLine1,
          billingZip: pc.billingZip,
          billingCity: pc.billingCity,
          billingProvince: pc.billingProvince,
          billingCountry: pc.billingCountry,
          billingEmail: pc.billingEmail,
          billingPec: pc.billingPec ?? undefined,
          billingSdiCode: pc.billingSdiCode ?? undefined,
        },
      });

      // eslint-disable-next-line no-console
      console.log(`Backfilled BillingProfile for client ${t.id}`);
    }
  } finally {
    await (tenant as any).$disconnect?.();
    await (pub as any).$disconnect?.();
  }
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});
