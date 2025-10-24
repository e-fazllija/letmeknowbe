import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { PrismaTenantService } from '../src/tenant/prisma-tenant.service';

function signToken(payload: any) {
  const secret = process.env.JWT_ACCESS_SECRET || 'dev_access_secret';
  const jwt = new JwtService({ secret });
  return jwt.sign(payload, { expiresIn: '10m' });
}

describe('Admin/Impostazioni – smoke (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaTenantService;
  const clientId = 'tenant_test';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaTenantService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('PATCH /v1/tenant/users/{id}/role – 401 without bearer', async () => {
    await request(app.getHttpServer()).patch('/v1/tenant/users/any/role').send({ role: 'AGENT' }).expect(401);
  });

  it('PATCH /v1/tenant/users/{id}/role – 403 with AGENT', async () => {
    const token = signToken({ sub: 'u1', clientId, role: 'AGENT' });
    await request(app.getHttpServer())
      .patch('/v1/tenant/users/u-any/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ADMIN' })
      .expect(403);
  });

  it('PATCH /v1/tenant/users/{id}/role – 200 with ADMIN on existing user', async () => {
    const user = await prisma.internalUser.create({
      data: { clientId, email: `test+${Date.now()}@example.com`, password: 'x', role: 'AGENT' as any, status: 'ACTIVE' as any },
    });
    const token = signToken({ sub: 'admin1', clientId, role: 'ADMIN' });
    await request(app.getHttpServer())
      .patch(`/v1/tenant/users/${user.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ADMIN' })
      .expect(200);
  });

  it('GET /v1/tenant/reports – works without clientId (uses JWT)', async () => {
    const token = signToken({ sub: 'u1', clientId, role: 'ADMIN' });
    await request(app.getHttpServer())
      .get('/v1/tenant/reports')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('GET/PUT /v1/tenant/case-policy – ADMIN-only', async () => {
    const token = signToken({ sub: 'u1', clientId, role: 'ADMIN' });
    await request(app.getHttpServer()).get('/v1/tenant/case-policy').set('Authorization', `Bearer ${token}`).expect(200);
    const putRes = await request(app.getHttpServer())
      .put('/v1/tenant/case-policy')
      .set('Authorization', `Bearer ${token}`)
      .send({ restrictVisibility: true })
      .expect(200);
    expect(putRes.body.restrictVisibility).toBe(true);
  });

  it('POST/GET /v1/tenant/templates – CRUD base', async () => {
    const token = signToken({ sub: 'u1', clientId, role: 'ADMIN' });
    await request(app.getHttpServer())
      .post('/v1/tenant/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Tpl ${Date.now()}`, questions: [{ label: 'Q1' }, { label: 'Q2', order: 5 }] })
      .expect(201);
    const list = await request(app.getHttpServer()).get('/v1/tenant/templates').set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(list.body)).toBe(true);
  });
});

