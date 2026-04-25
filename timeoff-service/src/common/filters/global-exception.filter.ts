import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { HcmApiException } from '../../modules/hcm-client/exceptions/hcm.exceptions';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;

    if (
      exception instanceof HcmApiException ||
      (exception as { constructor?: { name?: string } })?.constructor?.name ===
        'HcmApiException'
    ) {
      status = HttpStatus.BAD_GATEWAY;
      const hcmEx = exception as { message?: string };
      const rawMsg = hcmEx.message ?? '';
      message = rawMsg.startsWith('HCM service error')
        ? rawMsg
        : `HCM service error: ${rawMsg}`;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else {
        const resObj = res as { message?: string };
        message = resObj.message ?? exception.message;
      }
    } else if (exception instanceof Error) {
      // Detect upstream HCM 5xx failures propagated as AxiosError
      const axiosErr = exception as {
        isAxiosError?: boolean;
        response?: { status?: number };
      };
      if (
        axiosErr.isAxiosError &&
        axiosErr.response?.status &&
        axiosErr.response.status >= 500
      ) {
        status = HttpStatus.BAD_GATEWAY;
        message = `HCM service error: ${exception.message}`;
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = exception.message;
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
    }

    this.logger.error(
      `[${request.method}] ${request.url} → ${status}: ${message}`,
    );

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
