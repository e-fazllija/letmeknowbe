import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Hardening base
  app.use(helmet());
  app.use(cookieParser());

  // Abilita CORS (tutti gli origin, utile per test)
  app.enableCors({ origin: true, credentials: true });

  // Cookie parser per gestire refresh token HttpOnly

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

    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true, //Mantiene i token anche dopo il refresh
    },
  });

  const port = 3000;
  await app.listen(port);
  console.log(`API up on http://localhost:${port}/v1`);
  console.log(`Swagger on http://localhost:${port}/api`);
}
bootstrap();
