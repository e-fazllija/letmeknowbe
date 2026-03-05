import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaTenantService) {}

  list(clientId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    return (this.prisma as any).template.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include: { questions: { select: { id: true, label: true, order: true }, orderBy: { order: 'asc' } } },
    });
  }

  async create(clientId: string, body: { name: string; questions?: { label: string; order?: number }[] }) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const name = (body?.name || '').trim();
    if (!name) throw new BadRequestException('Nome template obbligatorio');
    const questions = Array.isArray(body?.questions) ? body!.questions! : [];
    return (this.prisma as any).template.create({
      data: {
        clientId,
        name,
        questions: questions.length
          ? { createMany: { data: questions.map((q, i) => ({ label: q.label, order: Number.isInteger(q.order) ? (q.order as number) : i })) } }
          : undefined,
      },
      include: { questions: { select: { id: true, label: true, order: true }, orderBy: { order: 'asc' } } },
    });
  }

  async update(clientId: string, id: string, body: { name?: string; questions?: { label: string; order?: number }[] }) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const tpl = await (this.prisma as any).template.findFirst({ where: { id, clientId }, select: { id: true } });
    if (!tpl) throw new NotFoundException('Template non trovato');

    const data: any = {};
    if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim();

    // Strategia semplice: se viene passato questions, sostituiamo la lista
    if (Array.isArray(body?.questions)) {
      await (this.prisma as any).templateQuestion.deleteMany({ where: { templateId: id } });
      await (this.prisma as any).templateQuestion.createMany({
        data: body!.questions!.map((q, i) => ({ templateId: id, label: q.label, order: Number.isInteger(q.order) ? (q.order as number) : i })),
      });
    }

    const updated = await (this.prisma as any).template.update({ where: { id }, data, include: { questions: { select: { id: true, label: true, order: true }, orderBy: { order: 'asc' } } } });
    return updated;
  }

  async remove(clientId: string, id: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const tpl = await (this.prisma as any).template.findFirst({ where: { id, clientId }, select: { id: true } });
    if (!tpl) throw new NotFoundException('Template non trovato');
    await (this.prisma as any).templateQuestion.deleteMany({ where: { templateId: id } });
    await (this.prisma as any).template.delete({ where: { id } });
    return { message: 'Template eliminato' };
  }
}

