// 数据层：本地仓储。
// 唯一负责持久化（localStorage），保证刷新后牙位、耗材、费用、冲销与版本一致。
// 不实现任何业务规则；规则层产出的新状态整体存入。

import type { AppState } from "./types";
import { seedState } from "./seed";

const STORAGE_KEY = "hxwl-04.billing.v1";

export function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}

/** 结构校验：只确认顶层形状，避免脏数据导致规则层崩溃 */
function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.patients) &&
    Array.isArray(candidate.teeth) &&
    Array.isArray(candidate.payments)
  );
}

export function loadState(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneState(seedState);
    const parsed: unknown = JSON.parse(raw);
    if (!isAppState(parsed)) return cloneState(seedState);
    return parsed as AppState;
  } catch {
    return cloneState(seedState);
  }
}

export function saveState(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用（隐私模式/配额）时仅本次会话失效，不影响页面操作
  }
}

export function resetState(): AppState {
  const fresh = cloneState(seedState);
  saveState(fresh);
  return fresh;
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
