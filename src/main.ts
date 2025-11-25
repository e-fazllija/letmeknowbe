import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded, raw } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as crypto from 'crypto';
import { sanitizeUrl } from './common/logging/sanitize-url';
import { csrfMiddleware } from './common/middleware/csrf.middleware';

async function bootstrap() {
  // Disabilitiamo il bodyParser di Nest per gestire manualmente il raw body di Stripe
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Correlation ID / Request logging (lightweight)
  app.use((req: any, res: any, next: any) => {
    const rid = (req.headers['x-request-id'] as string) || (crypto as any).randomUUID?.() || crypto.randomBytes(16).toString('hex');
    res.setHeader('x-request-id', rid);
    req.requestId = rid;
    const start = Date.now();
    res.on('finish', () => {
      const enabled = (process.env.HTTP_LOG_ENABLED || '').toLowerCase() === 'true' || process.env.HTTP_LOG_ENABLED === '1';
      if (enabled) {
        // eslint-disable-next-line no-console
        const urlRaw = (req.originalUrl || req.url || '') as string;
        const urlSafe = sanitizeUrl(urlRaw);
        console.info('http', { rid, method: req.method, url: urlSafe, status: res.statusCode, ms: Date.now() - start });
      }
    });
    next();
  });

  // Hardening base
  app.use(helmet());
  app.use(cookieParser());

  // Raw body for Stripe webhook signature verification (salta il JSON parser)
  const stripeWebhookPath = '/v1/public/stripe/webhook';
  const jsonParser = json({ limit: '1mb' });
  const urlencodedParser = urlencoded({ extended: true, limit: '1mb' });
  app.use(stripeWebhookPath, raw({ type: 'application/json' }));
  app.use((req: any, res: any, next: any) => {
    if (req.originalUrl?.startsWith(stripeWebhookPath)) return next();
    return jsonParser(req, res, next);
  });
  app.use((req: any, res: any, next: any) => {
    if (req.originalUrl?.startsWith(stripeWebhookPath)) return next();
    return urlencodedParser(req, res, next);
  });

  // Abilita CORS (credentials:true) – evita '*'
  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  const allowedOriginsCsv = process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_BASE_URL || '';
  const allowedOrigins = allowedOriginsCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const corsOrigin: any = allowedOrigins.length > 0
    ? allowedOrigins
    : (isProd
        ? (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
            if (!origin) return cb(new Error('Origin required'));
            return cb(new Error('Not allowed by CORS'));
          }
        : true);

  // In produzione non esponiamo/accettiamo x-tenant-id dal browser
  // Autorizziamo esplicitamente Authorization (necessario per MFA bearer) e, in dev, anche header custom usati dal FE
  const baseAllowed = ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'X-CSRF-Token'];
  const allowedHeaders = isProd ? baseAllowed : [...baseAllowed, 'x-tenant-id', 'x-mfa-token'];
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    allowedHeaders,
    exposedHeaders: ['x-mfa-token', 'x-auth-mfa'],
  });

  // Cookie parser per gestire refresh token HttpOnly
  app.use(csrfMiddleware);

  // Prefisso globale (facoltativo)
  app.setGlobalPrefix('v1');

  // Validazione globale
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  //Configurazione Swagger con descrizioni
  const config = new DocumentBuilder()
    .setTitle('LetMeKnow API')
    .setDescription(
      `API multi-tenant per la gestione del whistleblowing.<br><br>
      <b>Autenticazione:</b><br>
      - Inserisci un <b>token JWT</b> (Authorization: Bearer &lt;token&gt;) per accedere alle rotte protette.<br>
      - In alternativa, puoi usare un <b>ID Tenant</b> opzionale tramite header <code>x-tenant-id</code>.<br><br>
      Puoi cliccare su <b>Authorize</b> per aggiungere queste informazioni una sola volta.`
    )
    .setVersion('1.0')

    //Aggiunge il campo per il token JWT
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Inserisci qui il tuo token JWT per accedere alle API protette.<br><br>Esempio: <code>Bearer eyJhbGciOi...</code>',
      },
      'access-token',
    )

    // Aggiunge il campo per l’ID Tenant (opzionale)
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-tenant-id',
        in: 'header',
        description:
          'Inserisci qui l`ID del tenant se necessario per identificare il contesto multi-tenant.<br>Esempio: <code>intent-001</code>',
      },
      'tenant-key',
    )

    // CSRF header opzionale (double-submit cookie)
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-CSRF-Token',
        in: 'header',
        description: 'Token CSRF (uguale al cookie XSRF-TOKEN) quando CSRF_PROTECTION=true',
      },
      'csrf-token',
    )

    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true, //Mantiene i token anche dopo il refresh
    },
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  const host = process.env.HOST || 'localhost';
  console.log(`API up on http://${host}:${port}/v1`);
  console.log(`Swagger on http://${host}:${port}/api`);
}
bootstrap();
