export class Mp3ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Mp3ParseError';
  }
}
