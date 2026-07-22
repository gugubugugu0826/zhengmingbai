/**
 * 轻量 axios 封装：统一前缀 /api/v1、JWT 注入、code !== 0 统一抛错。
 * code 2001（未登录/过期）自动清 C 端 token 并跳登录页。
 *
 * v2.2 T04：/api/v1/admin/*（不含 /admin/auth/* 公开登录段）注入独立 admin token
 * （zmb_admin_token），与 C 端登录态完全隔离；admin 接口返回 2001/2003 时
 * 只清 admin token，由 AdminLogin 页负责跳回 /admin，不污染 C 端登录态。
 *
 * v3 T02：
 * - HTTP 503 + code 3001（维护模式）→ maintenanceStore.enter，AppShell 渲染全屏维护页；
 *   公告文案取响应体 data.notice，回退 message。
 * - 错误码备注：2107=暂停注册（注册页拦截），2108=手机号占用
 *   （注意 v3 语义迁移：2107 从"手机号占用"让位给"暂停注册"，手机号占用改用 2108）。
 */
import axios, { AxiosError, type AxiosInstance, type AxiosResponse } from 'axios';
import { adminTokenStore } from './admin/auth';
import { maintenanceStore } from './maintenance';

/** v3 错误码常量（与后端共享知识 §错误码 对齐） */
export const API_CODES = {
  /** 未登录/过期 */
  UNAUTHORIZED: 2001,
  /** 无权限 */
  FORBIDDEN: 2003,
  /** 图形码错误 */
  CAPTCHA_WRONG: 2101,
  /** 邮箱验证码错误或过期 */
  EMAIL_CODE_WRONG: 2102,
  /** 发送频繁 */
  SEND_TOO_OFTEN: 2103,
  /** 当日发送达上限 */
  SEND_DAILY_LIMIT: 2104,
  /** 邮箱已占用 */
  EMAIL_TAKEN: 2105,
  /** 用户名占用 */
  USERNAME_TAKEN: 2106,
  /** 暂停注册（v3 新语义，从"手机号占用"让位） */
  REGISTRATION_PAUSED: 2107,
  /** 手机号占用（v3 从 2107 迁来） */
  PHONE_TAKEN: 2108,
  /** 维护模式（HTTP 503） */
  MAINTENANCE: 3001,
} as const;

interface MaintenanceBody {
  notice?: string;
}

/** 维护模式拦截：写全局状态，AppShell 订阅后渲染 MaintenancePage 全屏 */
function handleMaintenance(data: unknown, fallbackMessage: string): void {
  const notice =
    (data as MaintenanceBody | null)?.notice?.trim() || fallbackMessage || '系统维护中，请稍后再来';
  maintenanceStore.enter(notice);
}

const TOKEN_KEY = 'zmb_token';

export const tokenStore = {
  get(): string {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  },
  set(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
  },
};

interface Envelope<T> {
  code: number;
  data: T;
  message: string;
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

const client: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 60000, // AI 分析 Mock 秒回，真实模式预留长超时
});

/** 是否 /admin 后台接口（公开登录段 /admin/auth/* 除外） */
function isAdminApi(url: string | undefined): boolean {
  return !!url && url.startsWith('/admin/') && !url.startsWith('/admin/auth/');
}

client.interceptors.request.use((config) => {
  const token = isAdminApi(config.url) ? adminTokenStore.get() : tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response: AxiosResponse<Envelope<unknown>>) => response,
  (error: AxiosError<Envelope<unknown>>) => {
    // 非 2xx：后端统一响应格式里带上 code/message
    const body = error.response?.data;
    const code = body?.code ?? -1;
    const message = body?.message ?? '网络开了小差，请稍后再试';
    if (code === API_CODES.MAINTENANCE) {
      handleMaintenance(body?.data, message);
    }
    if (code === 2001 || code === 2003) {
      // /admin 会话失效：只清 admin token，由 AdminLogin 页跳回 /admin（不动 C 端登录态）
      if (window.location.pathname.startsWith('/admin')) {
        adminTokenStore.clear();
      } else if (code === 2001) {
        tokenStore.clear();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(new ApiError(code, message));
  },
);

/** 统一请求：解包 { code, data, message }，code !== 0 抛 ApiError */
export async function request<T>(
  method: 'get' | 'post' | 'patch' | 'delete' | 'put',
  url: string,
  body?: unknown,
  params?: Record<string, unknown>,
): Promise<T> {
  const resp = await client.request<Envelope<T>>({ method, url, data: body, params });
  const envelope = resp.data;
  if (envelope.code !== 0) {
    if (envelope.code === API_CODES.MAINTENANCE) {
      handleMaintenance(envelope.data, envelope.message);
    }
    if (envelope.code === 2001 || envelope.code === 2003) {
      if (window.location.pathname.startsWith('/admin')) {
        adminTokenStore.clear();
      } else if (envelope.code === 2001) {
        tokenStore.clear();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    throw new ApiError(envelope.code, envelope.message || '请求失败');
  }
  return envelope.data;
}

export const api = {
  get: <T>(url: string, params?: Record<string, unknown>) => request<T>('get', url, undefined, params),
  post: <T>(url: string, body?: unknown) => request<T>('post', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('patch', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('put', url, body),
  delete: <T>(url: string) => request<T>('delete', url),
};

/** 读取 File 为 dataURL（后端 base64 上传格式：data:image/jpeg;base64,...） */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('照片读取失败'));
    reader.readAsDataURL(file);
  });
}
