import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS (modifica origin a piacere)
  app.enableCors({ origin: true, credentials: true });

  // Prefix globale (opzionale)
  app.setGlobalPrefix('v1');

  // Validazione globale + trasformazione tipi (enum inclusi)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,                 // rimuove campi extra
      forbidNonWhitelisted: false,     // se vuoi, metti true per 400 su campi sconosciuti
      transform: true,                 // abilita class-transformer
      transformOptions: {
        enableImplicitConversion: true // conversioni base (string->number ecc.)
      },
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('LetMeKnow API')
    .setDescription('API multi-tenant per gestione whistleblowing')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = 3000;
  await app.listen(port);
  console.log(`API up on http://localhost:${port}/v1`);
  console.log(`Swagger on http://localhost:${port}/api`);
}
bootstrap();
