import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const toBoolean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? ['true', '1', 'yes'].includes(value.toLowerCase()) : value;

/**
 * Every environment variable the application reads. Validated once at
 * start-up; the app refuses to boot with a missing or malformed value.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST = 'localhost';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  REDIS_PORT = 6379;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  /** Access token lifetime in seconds. */
  @Type(() => Number)
  @IsInt()
  @Min(30)
  JWT_ACCESS_TTL = 900;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  /** Refresh token lifetime in seconds. */
  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_REFRESH_TTL = 604800;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: LogLevel = 'info';

  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED = true;

  /** Comma-separated list of allowed origins; empty disables CORS. */
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Invalid environment configuration -> ${details}`);
  }

  return validated;
}
