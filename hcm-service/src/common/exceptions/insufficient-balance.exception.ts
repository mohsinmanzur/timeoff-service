import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientBalanceException extends HttpException {
  constructor(public readonly availableDays: number) {
    super(
      {
        code: 'INSUFFICIENT_BALANCE',
        message: 'The requested deduction exceeds the available balance.',
        availableDays,
      },
      HttpStatus.UNPROCESSABLE_ENTITY, // 422
    );
  }
}
