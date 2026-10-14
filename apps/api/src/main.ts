import 'reflect-metadata';
import compression from 'compression';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin: config.get<string[]>('app.corsOrigins', ['http://localhost:5173']),
    credentials: true,
  });

  app.setGlobalPrefix(config.get<string>('app.apiPrefix', 'api'));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  const port = config.get<number>('app.port', 5001);

  await app.listen(port);
}

void bootstrap();
