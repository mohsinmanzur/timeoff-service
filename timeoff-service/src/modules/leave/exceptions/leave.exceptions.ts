import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientBalanceException extends HttpException {
  constructor(message = 'Insufficient leave balance') {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class InvalidRequestException extends HttpException {
  constructor(message = 'Invalid leave request') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class RequestNotFoundException extends HttpException {
  constructor(message = 'Request not found') {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class InvalidStatusTransitionException extends HttpException {
  constructor(message = 'Invalid status transition') {
    super(message, HttpStatus.CONFLICT);
  }
}

export class UnauthorizedCancellationException extends HttpException {
  constructor(message = 'Only the original requester can cancel this request') {
    super(message, HttpStatus.FORBIDDEN);
  }
}
