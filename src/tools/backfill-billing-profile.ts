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
      const existing = await (tenant as any).billingProfile.findUnique({ where: { clientId: t.id } });
      if (existing) continue;

      const pc = await (pub as any).client.findUnique({ where: { id: t.id } });
      if (!pc) continue;

      // Richiediamo almeno gli estremi minimi di billing; se mancano, salta
      if (!pc.billingTaxId || !pc.billingAddressLine1 || !pc.billingZip || !pc.billingCity || !pc.billingProvince || !pc.billingCountry || !pc.billingEmail) {
        // eslint-disable-next-line no-console
        console.warn(`Skip BillingProfile for client ${t.id}: incomplete billing data in PUBLIC`);
        continue;
      }

      await (tenant as any).billingProfile.create({
        data: {
          clientId: t.id,
          companyName: pc.companyName,
          taxId: pc.billingTaxId,
          address: pc.billingAddressLine1,
          zip: pc.billingZip,
          city: pc.billingCity,
          province: pc.billingProvince,
          country: pc.billingCountry,
          billingEmail: pc.billingEmail,
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

