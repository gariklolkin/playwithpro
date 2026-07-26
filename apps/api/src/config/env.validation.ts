import { Type, plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PORT = 4000;

  @IsString()
  DATABASE_URL: string;

  @IsUrl({ require_tld: false })
  WEB_APP_URL = 'http://localhost:3000';

  @IsUrl({ require_tld: false })
  API_URL = 'http://localhost:4000';

  @IsString()
  JWT_ACCESS_SECRET = 'dev-only-change-me';

  @IsString()
  SMTP_HOST = 'localhost';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  SMTP_PORT = 1025;

  @IsString()
  SMTP_FROM = 'PlayWithPro <no-reply@playwithpro.local>';

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  /** Service-account JSON key (whole file); absent = fake meeting provider. */
  @IsOptional()
  @IsString()
  GOOGLE_SA_KEY?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CALENDAR_ID?: string;

  /** Workspace user the service account impersonates (calendar owner). */
  @IsOptional()
  @IsString()
  GOOGLE_IMPERSONATE_SUBJECT?: string;

  /** S3 endpoint the API talks to (in-cluster for MinIO). */
  @IsUrl({ require_tld: false })
  S3_ENDPOINT = 'http://localhost:9000';

  /** Browser-facing S3 endpoint; pre-signed URLs are signed against it. */
  @IsUrl({ require_tld: false })
  S3_PUBLIC_URL = 'http://localhost:9000';

  @IsString()
  S3_REGION = 'us-east-1';

  @IsString()
  S3_BUCKET = 'playwithpro-videos';

  @IsString()
  S3_ACCESS_KEY = 'playwithpro';

  @IsString()
  S3_SECRET_KEY = 'playwithpro123';

  /** Upper bound for an uploaded video file. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  VIDEO_MAX_SIZE_MB = 2048;

  /** Upper bound for a video's duration, enforced at the ffprobe stage. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  VIDEO_MAX_DURATION_MIN = 30;

  /** Coach-side fee percentage withheld from the payout at release. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  PLATFORM_FEE_PERCENT = 10;

  /** Minutes a pending booking holds its slot before payment expires it. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  BOOKING_PAYMENT_TTL_MIN = 15;

  /**
   * Jitsi instance hosting embedded session rooms: a bare host (https
   * assumed) or a full origin like http://localhost:8000. Default is the
   * self-hosted dev stack from infra/docker-compose.yml over plain HTTP —
   * localhost is a secure context, so no certificate step, and public
   * instances no longer support embedded accountless rooms anyway.
   * Production must point this at a properly hosted HTTPS Jitsi (or a JaaS
   * deployment once JWT rooms are introduced).
   */
  @IsString()
  JITSI_DOMAIN = 'http://localhost:8000';

  /** Minutes before slot start when the session room opens. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ROOM_JOIN_WINDOW_BEFORE_MIN = 15;

  /** Minutes after slot end while the session room stays joinable. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ROOM_JOIN_WINDOW_AFTER_MIN = 30;

  /** Hours after slot end before an unconfirmed, undisputed session auto-completes. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  AUTO_CONFIRM_WINDOW_HOURS = 48;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  return validatedConfig;
}
