/** Error raised by the AI layer. `status` is the HTTP status the API should answer with. */
export class AiServiceError extends Error {
  status: number;
  /** True for failures that may succeed on a second try (a provider 5xx or a dropped connection), never for 4xx or 429. */
  retryable: boolean;

  constructor(message: string, status = 502, retryable = false) {
    super(message);
    this.name = 'AiServiceError';
    this.status = status;
    this.retryable = retryable;
  }
}
