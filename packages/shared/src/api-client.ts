/**
 * 轻量 API 客户端（web / miniprogram 复用）。
 * 不依赖 axios，基于 fetch，方便小程序端用 wx.request 适配层替换。
 */
import type { ApiResponse } from './types';

export interface ClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  onUnauthorized?: () => void;
}

export class ApiClient {
  constructor(private readonly options: ClientOptions) {}

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = this.options.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as ApiResponse<T>;
    if (json.code === 2001 && this.options.onUnauthorized) {
      this.options.onUnauthorized();
    }
    if (json.code !== 0) {
      throw new ApiError(json.code, json.message || '请求失败');
    }
    return json.data;
  }

  get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  del<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
