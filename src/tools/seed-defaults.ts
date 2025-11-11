import { PrismaClient } from '../generated/tenant';

async function run() {
  const prisma = new PrismaClient();
  try {
    const defaults = [
      { name: 'HR', sortOrder: 10, categories: ['Molestie', 'Discriminazioni', 'Mobbing'] },
      { name: 'Amministrazione/Finanza', sortOrder: 20, categories: ['Frode contabile', 'Fatture false', 'Appropriazione indebita'] },
      { name: 'IT', sortOrder: 30, categories: ['Sicurezza informatica', 'Accessi non autorizzati', 'Dati personali'] },
      { name: 'Compliance/Legal', sortOrder: 40, categories: ['Corruzione', 'Conflitto di interessi', 'Concorrenza sleale'] },
      { name: 'Sicurezza', sortOrder: 50, categories: ['Infortuni', 'Near-miss', 'Condizioni pericolose'] },
      { name: 'Altro', sortOrder: 90, categories: ['Altro'] },
    ];

    const existing = await prisma.department.count({ where: { clientId: null } });
    if (existing > 0) {
      console.log(`Global defaults already present: ${existing} departments`);
      return;
    }

    console.log('Seeding global defaults (clientId = NULL)...');
    for (const d of defaults) {
      const dep = await prisma.department.create({
        data: { clientId: null, name: d.name, sortOrder: d.sortOrder, active: true },
      });
      if (d.categories?.length) {
        for (let i = 0; i < d.categories.length; i++) {
          const c = d.categories[i];
          await prisma.category.create({
            data: { clientId: null, departmentId: dep.id, name: c, active: true, sortOrder: i },
          });
        }
      }
    }
    console.log('Seeding completed.');
  } finally {
    await (prisma as any).$disconnect?.();
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

