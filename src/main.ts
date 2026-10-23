import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp, SWAGGER_PATH } from './app.setup';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  configureApp(app);

  const config = app.get(AppConfigService);
  await app.listen(config.get('PORT'), '0.0.0.0');

  const url = await app.getUrl();
  logger.log(`API listening on ${url}`, 'Bootstrap');
  if (config.get('SWAGGER_ENABLED')) {
    logger.log(`Swagger UI available at ${url}/${SWAGGER_PATH}`, 'Bootstrap');
  }
}

void bootstrap();
