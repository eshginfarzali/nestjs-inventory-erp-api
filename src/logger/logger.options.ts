import type { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type { AppConfigService } from '../config/app-config.service';
import { NodeEnv } from '../config/env.validation';

const REQUEST_ID_HEADER = 'x-request-id';

/** Accept an upstream request id (e.g. from a gateway) if it looks sane, otherwise mint one. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && /^[\w.-]{1,128}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

export function buildLoggerOptions(config: AppConfigService): Params {
  const pretty = config.get('NODE_ENV') === NodeEnv.Development;
  return {
    pinoHttp: {
      level: config.get('LOG_LEVEL'),
      genReqId: resolveRequestId,
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[REDACTED]',
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
      customProps: (req) => {
        const user = (req as IncomingMessage & { user?: AuthUser }).user;
        return user ? { userId: user.id, role: user.role } : {};
      },
      ...(pretty
        ? { transport: { target: 'pino-pretty', options: { singleLine: true, colorize: true } } }
        : {}),
    },
  };
}
