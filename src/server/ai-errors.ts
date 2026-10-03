/** Error raised by the AI layer. `status` is the HTTP status the API should answer with. */
export class AiServiceError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AiServiceError';
    this.status = status;
  }
}
