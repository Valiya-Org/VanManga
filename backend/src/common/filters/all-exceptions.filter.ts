import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiException, errorCodeOf } from '../http/api-exception';

/** Legacy routes keep the pre-P2 error structure until P4 deletes them. */
const LEGACY_PREFIX = '/api/dogemanga/';

const DEFAULT_ERRORS: Record<number, string> = {
  400: 'bad-request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not-found',
  409: 'conflict',
  413: 'payload-too-large',
  429: 'rate-limited',
  500: 'internal-error',
};

/** The 4xx status of an `http-errors`-style error that a middleware raised
 *  and marked safe to expose — body-parser's `entity.too.large` (413),
 *  `charset.unsupported` (415) and so on. Anything else is not trusted
 *  and stays a 500. (Malformed JSON is a SyntaxError that Nest has already
 *  turned into a BadRequestException.) */
function exposedClientStatus(exception: unknown): number | null {
  if (!(exception instanceof Error)) return null;
  const { status, statusCode, expose } = exception as Error & {
    status?: unknown;
    statusCode?: unknown;
    expose?: unknown;
  };
  const code = typeof status === 'number' ? status : statusCode;
  if (expose !== true || typeof code !== 'number') return null;
  return code >= 400 && code < 500 ? code : null;
}

interface CanonicalFailure {
  code: number;
  error: string;
  message?: string;
  data?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (exposedClientStatus(exception) ?? HttpStatus.INTERNAL_SERVER_ERROR);

    const log = `[${request.method}] ${request.url} -> ${status}`;
    if (status >= 500) {
      this.logger.error(
        log,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${log}: ${exception instanceof Error ? exception.message : String(exception)}`,
      );
    }

    const url = request.originalUrl ?? request.url;
    if (url.startsWith(LEGACY_PREFIX)) {
      response.status(status).json({
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        message:
          exception instanceof HttpException
            ? exception.getResponse()
            : exception instanceof Error
              ? exception.message
              : 'Unknown error',
      });
      return;
    }

    response.status(status).json(this.canonical(exception, status));
  }

  private canonical(exception: unknown, status: number): CanonicalFailure {
    if (!(exception instanceof HttpException)) {
      if (status < 500) {
        // A middleware's client error (e.g. body-parser's 413): the status
        // is the whole story; its message stays in the log.
        return { code: status, error: DEFAULT_ERRORS[status] ?? `http-${status}` };
      }
      // Internal details stay in the log, not in the response.
      return { code: status, error: 'internal-error' };
    }

    const body: CanonicalFailure = {
      code: status,
      error: errorCodeOf(exception) ?? DEFAULT_ERRORS[status] ?? `http-${status}`,
    };

    const raw = exception.getResponse();
    const rawMessage =
      typeof raw === 'string'
        ? raw
        : (raw as { message?: unknown }).message;

    if (Array.isArray(rawMessage)) {
      // ValidationPipe: a list of constraint messages.
      if (status === 400 && !errorCodeOf(exception)) body.error = 'validation-failed';
      body.message = rawMessage.map(String).join('; ');
    } else if (typeof rawMessage === 'string' && rawMessage !== body.error) {
      body.message = rawMessage;
    }

    if (exception instanceof ApiException && exception.data !== undefined) {
      body.data = exception.data;
    }
    return body;
  }
}
