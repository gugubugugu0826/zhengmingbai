/**
 * 维护模式全局状态（v3 T02）：
 * api 拦截层检测到 code 3001（HTTP 503）时调用 enter()，
 * AppShell 订阅本状态并渲染 MaintenancePage 全屏页。
 * 无鉴权的 GET /configs/public 每 30s 轮询一次，维护关闭后自动恢复。
 */

export interface MaintenanceInfo {
  enabled: boolean;
  notice: string;
}

type Listener = (info: MaintenanceInfo) => void;

let current: MaintenanceInfo = { enabled: false, notice: '' };
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((fn) => fn(current));
}

/** 进入维护模式（api.ts 拦截 3001 时调用） */
export function enter(notice: string): void {
  if (current.enabled && current.notice === notice) return;
  current = { enabled: true, notice };
  emit();
}

/** 退出维护模式（轮询发现已恢复时调用） */
export function exit(): void {
  if (!current.enabled) return;
  current = { enabled: false, notice: '' };
  emit();
}

/** 订阅维护状态；返回退订函数 */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}

/** 当前状态快照（非响应式读取） */
export function snapshot(): MaintenanceInfo {
  return current;
}

export const maintenanceStore = { enter, exit, subscribe, snapshot };
