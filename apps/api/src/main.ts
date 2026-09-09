import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { CorsIoAdapter } from './config/socket-io.adapter';

async function bootstrap() {
  // rawBody: LiveKit webhooks are verified against a hash of the exact body.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // LiveKit posts webhooks as application/webhook+json. Registering a json
  // parser here replaces Nest's default one, so it must list both types.
  app.useBodyParser('json', {
    type: ['application/json', 'application/webhook+json'],
  });

  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: config.get<string>('WEB_APP_URL'),
    credentials: true,
  });
  app.useWebSocketAdapter(
    new CorsIoAdapter(app, config.getOrThrow<string>('WEB_APP_URL')),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PlayWithPro API')
    .setDescription('PlayWithPro marketplace API')
    .setVersion('0.1')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
}

void bootstrap();
