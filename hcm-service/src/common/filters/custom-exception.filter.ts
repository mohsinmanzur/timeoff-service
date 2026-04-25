import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { InsufficientBalanceException } from '../exceptions/insufficient-balance.exception';

@Catch()
export class CustomExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof InsufficientBalanceException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      response.status(status).json(exceptionResponse);
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      response.status(status).json(
        typeof exceptionResponse === 'object' ? exceptionResponse : { message: exceptionResponse }
      );
    } else {
      // Default to 500 for unhandled exceptions
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
    }
  }
}
