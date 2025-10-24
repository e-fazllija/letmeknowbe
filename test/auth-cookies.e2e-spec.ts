import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import cookieParser from 'cookie-parser';

describe('Auth cookies flow (e2e)', () => {
  let app: INestApplication;
  const clientId = 'tenant_e2e_cookies';
  const email = 'cookie.user@example.com';
  const password = 'P@ssw0rd!';

  let cookieJar: string[] = [];

  const getSetCookies = (res: request.Response): string[] => {
    const raw = res.get('set-cookie') as unknown;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as string[];
    return [String(raw)];
  };

  const setJarFrom = (res: request.Response) => {
    const setCookies = getSetCookies(res);
    if (setCookies && setCookies.length) {
      // Replace same-named cookies, keep others
      const byName = (c: string) => c.split('=')[0];
      const current: Record<string, number> = {};
      cookieJar.forEach((c, i) => (current[byName(c)] = i));
      setCookies.forEach((c) => {
        const name = byName(c);
        if (current[name] !== undefined) {
          cookieJar[current[name]] = c;
        } else {
          cookieJar.push(c);
        }
      });
    }
  };

  const cookieHeader = () => cookieJar.map((c) => c.split(';')[0]).join('; ');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('signup user (admin)', async () => {
    await request(app.getHttpServer())
      .post('/v1/tenant/auth/signup')
      .send({ clientId, email, password, role: 'ADMIN' })
      .expect((res) => {
        // accept 201 or 200 depending on controller default
        if (![200, 201, 409].includes(res.status)) throw new Error('unexpected status');
      });
  });

  it('login issues access+refresh cookies', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/tenant/auth/login')
      .set('x-tenant-id', clientId)
      .send({ email, password })
      .expect(201);

    const setCookies = getSetCookies(res);
    expect(setCookies.some((c) => c.startsWith('refresh_token='))).toBeTruthy();
    expect(setCookies.some((c) => c.startsWith('access_token='))).toBeTruthy();
    setJarFrom(res);
  });

  it('/auth/me works with only cookies', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/tenant/auth/me')
      .set('Cookie', cookieHeader())
      .expect(200);

    const body = res.body;
    expect(body).toHaveProperty('userId');
    expect(body).toHaveProperty('clientId', clientId);
    expect(body).toHaveProperty('email', email);
    expect(['admin', 'agent', 'auditor']).toContain(String(body.role));
    expect(Array.isArray(body.permissions)).toBeTruthy();
  });

  it('refresh issues a new access_token cookie and /me remains OK', async () => {
    // drop access_token from jar
    cookieJar = cookieJar.filter((c) => !c.startsWith('access_token='));
    const res = await request(app.getHttpServer())
      .post('/v1/tenant/auth/refresh')
      .set('Cookie', cookieHeader())
      .expect(200);
    setJarFrom(res);

    // me should still work
    await request(app.getHttpServer()).get('/v1/tenant/auth/me').set('Cookie', cookieHeader()).expect(200);
  });

  it('logout clears cookies', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/tenant/auth/logout')
      .set('Cookie', cookieHeader())
      .expect(204);
    const setCookies = getSetCookies(res);
    expect(setCookies.some((c) => c.startsWith('access_token=;'))).toBeTruthy();
    expect(setCookies.some((c) => c.startsWith('refresh_token=;'))).toBeTruthy();
  });
});
