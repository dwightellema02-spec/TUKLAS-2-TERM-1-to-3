/**
 * Tuklas 2.0 — Standardized API Types
 *
 * Defines the uniform response envelopes used across all Route Handlers and client callers.
 */

import { PublicUser } from './domain';

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  error: null;
};

export type ApiErrorResponse = {
  success: false;
  data: null;
  error: string;
  code?: string;
  details?: unknown;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type SessionState = {
  authenticated: boolean;
  user: PublicUser | null;
};

export type PaginatedList<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};
