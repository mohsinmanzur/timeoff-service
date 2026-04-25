export class HcmApiException extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly responseBody?: any,
  ) {
    super(message);
    this.name = 'HcmApiException';
  }
}

export class HcmInsufficientBalanceException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HcmInsufficientBalanceException';
  }
}

export class HcmInvalidDimensionException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HcmInvalidDimensionException';
  }
}
