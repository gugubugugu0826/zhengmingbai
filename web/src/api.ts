/**
 * 轻量 fetch 封装（v3.1 T03：axios → 原生 fetch，签名与拦截语义全保留，调用方零改动）：
 * 统一前缀 /api/v1、JWT 注入、code !== 0 统一抛错。
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

/** 是否 /admin 后台接口（公开登录段 /admin/auth/* 除外） */
function isAdminApi(url: string | undefined): boolean {
  return !!url && url.startsWith('/admin/') && !url.startsWith('/admin/auth/');
}

/** 请求超时（ms）：对齐原 axios 配置 60s（AI 分析 Mock 秒回，真实模式预留长超时） */
const REQUEST_TIMEOUT_MS = 60000;

/** 会话失效分支：双通道（C 端 / admin 端）隔离处理，axios 拦截器同款语义 */
function handleAuthError(code: number): void {
  if (code !== API_CODES.UNAUTHORIZED && code !== API_CODES.FORBIDDEN) return;
  // /admin 会话失效：只清 admin token，由 AdminLogin 页跳回 /admin（不动 C 端登录态）
  if (window.location.pathname.startsWith('/admin')) {
    adminTokenStore.clear();
  } else if (code === API_CODES.UNAUTHORIZED) {
    tokenStore.clear();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }
}

/** fetch 底层调用：拼接 baseURL/params、注入 JWT、JSON 编解码、超时控制 */
async function fetchRaw(
  method: string,
  url: string,
  body?: unknown,
  params?: Record<string, unknown>,
): Promise<Response> {
  // 拼 query（axios params 语义：undefined/null 跳过，数组重复 key，对象 JSON 序列化）
  let fullUrl = `/api/v1${url}`;
  if (params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) search.append(key, String(item));
      } else if (typeof value === 'object') {
        search.append(key, JSON.stringify(value));
      } else {
        search.append(key, String(value));
      }
    }
    const qs = search.toString();
    if (qs) fullUrl += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  const token = isAdminApi(url) ? adminTokenStore.get() : tokenStore.get();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let requestBody: string | undefined;
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }

  // AbortController 实现超时（axios timeout 语义）
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(fullUrl, {
      method: method.toUpperCase(),
      headers,
      body: requestBody,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(-1, '请求超时，请稍后再试');
    }
    // 网络层失败（DNS/断网/CORS 等，fetch 不会抛 HTTP 错误码）
    throw new ApiError(-1, '网络开了小差，请稍后再试');
  } finally {
    clearTimeout(timer);
  }
}

/** 统一请求：解包 { code, data, message }，code !== 0 抛 ApiError */
export async function request<T>(
  method: 'get' | 'post' | 'patch' | 'delete' | 'put',
  url: string,
  body?: unknown,
  params?: Record<string, unknown>,
): Promise<T> {
  const resp = await fetchRaw(method, url, body, params);

  // 解析响应体（非 JSON 响应兜底为空 envelope，走默认错误文案）
  let envelope: Envelope<T> | null = null;
  try {
    envelope = (await resp.json()) as Envelope<T>;
  } catch {
    envelope = null;
  }

  // 非 2xx：后端统一响应格式里带上 code/message（axios 响应拦截器同款分支）
  if (!resp.ok) {
    const code = envelope?.code ?? -1;
    const message = envelope?.message ?? '网络开了小差，请稍后再试';
    if (code === API_CODES.MAINTENANCE) {
      handleMaintenance(envelope?.data, message);
    }
    handleAuthError(code);
    throw new ApiError(code, message);
  }

  if (!envelope) {
    throw new ApiError(-1, '网络开了小差，请稍后再试');
  }

  // 2xx 但业务 code !== 0：同样走维护/会话拦截
  if (envelope.code !== 0) {
    if (envelope.code === API_CODES.MAINTENANCE) {
      handleMaintenance(envelope.data, envelope.message);
    }
    handleAuthError(envelope.code);
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
