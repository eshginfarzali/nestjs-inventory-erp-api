import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from './config/app-config.service';

export const SWAGGER_PATH = 'docs';

/** HTTP-level setup shared by main.ts and the e2e tests. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfigService);

  app.disable('x-powered-by');
  app.enableShutdownHooks();

  const origins = config.corsOrigins;
  if (origins.length > 0) {
    app.enableCors({ origin: origins, credentials: true });
  }

  if (config.get('SWAGGER_ENABLED')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Inventory & Production ERP API')
        .setDescription(
          'Products, warehouses, stock ledger, production orders and low-stock alerts. ' +
            'Authenticate via POST /auth/login and use the access token as a Bearer token.',
        )
        .setVersion('1.0.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(SWAGGER_PATH, app, document, {
      jsonDocumentUrl: `${SWAGGER_PATH}/openapi.json`,
      swaggerOptions: { persistAuthorization: true },
    });
  }
}
