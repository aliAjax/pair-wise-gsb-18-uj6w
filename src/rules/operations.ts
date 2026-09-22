// 规则层：状态流转。输入旧状态，校验通过后返回新状态，不做持久化与渲染。

import type { AppState, ToothStage } from "../data/types";
import { cloneState, createId } from "../data/repository";
import { lineAmount } from "./money";
import { patientDebt } from "./billing";
import {
  canCorrect,
  canPay,
  canReverse,
  canScheduleVisit,
  canSettle,
  validateItemDraft,
  type DraftItem,
  type RuleResult,
} from "./validations";
import { itemRefundable } from "./billing";
import { applyCorrection, buildCorrection, type DraftCorrectionItem } from "./corrections";

function withTooth(
  state: AppState,
  toothId: string,
  update: (tooth: AppState["teeth"][number]) => AppState["teeth"][number]
): AppState {
  return {
    ...state,
    teeth: state.teeth.map((tooth) => (tooth.id === toothId ? update(tooth) : tooth)),
  };
}

/** 牙位登记耗材：缺耗材或价格非正不能确认 */
export function addItem(
  state: AppState,
  toothId: string,
  draft: DraftItem
): RuleResult<AppState> {
  const tooth = state.teeth.find((entry) => entry.id === toothId);
  if (!tooth) return { ok: false, error: "牙位不存在" };
  if (tooth.status === "settled") {
    return { ok: false, error: "牙位已结账冻结，新增耗材请先走更正" };
  }
  const check = validateItemDraft(draft);
  if (!check.ok) return check;

  const next = cloneState(state);
  const target = next.teeth.find((entry) => entry.id === toothId)!;
  target.items.push({
    id: createId("i"),
    name: draft.name.trim(),
    unitPrice: draft.unitPrice,
    quantity: draft.quantity,
    payer: draft.payer,
    amount: lineAmount(draft.unitPrice, draft.quantity),
    createdAt: new Date().toISOString(),
  });
  return { ok: true, value: next };
}

/** 结账：冻结牙位 */
export function settleTooth(state: AppState, toothId: string): RuleResult<AppState> {
  const tooth = state.teeth.find((entry) => entry.id === toothId);
  if (!tooth) return { ok: false, error: "牙位不存在" };
  const check = canSettle(tooth);
  if (!check.ok) return check;

  const next = cloneState(state);
  const target = next.teeth.find((entry) => entry.id === toothId)!;
  target.status = "settled";
  target.settledAt = new Date().toISOString();
  return { ok: true, value: next };
}

/** 退费：只生成带原因的冲销，原项目金额保留不动 */
export function reverseItem(
  state: AppState,
  toothId: string,
  itemId: string,
  amount: number,
  reason: string
): RuleResult<AppState> {
  const tooth = state.teeth.find((entry) => entry.id === toothId);
  if (!tooth) return { ok: false, error: "牙位不存在" };
  const item = tooth.items.find((entry) => entry.id === itemId);
  if (!item) return { ok: false, error: "耗材项目不存在" };
  const check = canReverse(tooth, itemId, amount, reason, itemRefundable(tooth, item));
  if (!check.ok) return check;

  const next = cloneState(state);
  const target = next.teeth.find((entry) => entry.id === toothId)!;
  target.reversals.push({
    id: createId("r"),
    itemId,
    itemName: item.name,
    amount: lineAmount(amount, 1),
    reason: reason.trim(),
    createdAt: new Date().toISOString(),
  });
  return { ok: true, value: next };
}

/** 已结账牙位更正：新建带原因版本，旧值完整保留 */
export function correctTooth(
  state: AppState,
  toothId: string,
  drafts: DraftCorrectionItem[],
  reason: string
): RuleResult<AppState> {
  const tooth = state.teeth.find((entry) => entry.id === toothId);
  if (!tooth) return { ok: false, error: "牙位不存在" };
  const gate = canCorrect(tooth, reason);
  if (!gate.ok) return gate;

  const built = buildCorrection(tooth, drafts, reason);
  if (!built.ok) return built;

  const next = cloneState(state);
  const target = next.teeth.find((entry) => entry.id === toothId)!;
  const corrected = applyCorrection(target, built.value);
  Object.assign(target, corrected);
  return { ok: true, value: next };
}

/** 排下次复诊：患者欠费未清不能排 */
export function scheduleVisit(
  state: AppState,
  toothId: string,
  date: string
): RuleResult<AppState> {
  const tooth = state.teeth.find((entry) => entry.id === toothId);
  if (!tooth) return { ok: false, error: "牙位不存在" };
  if (!date) return { ok: false, error: "请选择复诊日期" };
  const debt = patientDebt(state, tooth.patientId);
  const check = canScheduleVisit(debt);
  if (!check.ok) return check;

  const next = cloneState(state);
  return {
    ok: true,
    value: withTooth(next, toothId, (entry) => ({ ...entry, nextVisitDate: date })),
  };
}

/** 缴费核销欠费（不允许多缴） */
export function recordPayment(
  state: AppState,
  patientId: string,
  amount: number,
  note: string
): RuleResult<AppState> {
  if (!state.patients.some((patient) => patient.id === patientId)) {
    return { ok: false, error: "患者不存在" };
  }
  const check = canPay(amount, patientDebt(state, patientId));
  if (!check.ok) return check;

  const next = cloneState(state);
  next.payments.push({
    id: createId("pay"),
    patientId,
    amount: lineAmount(amount, 1),
    note: note.trim() || "欠费核销",
    createdAt: new Date().toISOString(),
  });
  return { ok: true, value: next };
}

/** 更新在诊牙位的治疗阶段（已结账冻结不可改） */
export function setStage(
  state: AppState,
  toothId: string,
  stage: ToothStage
): RuleResult<AppState> {
  const tooth = state.teeth.find((entry) => entry.id === toothId);
  if (!tooth) return { ok: false, error: "牙位不存在" };
  if (tooth.status === "settled") return { ok: false, error: "已结账牙位已冻结" };
  const next = cloneState(state);
  return { ok: true, value: withTooth(next, toothId, (entry) => ({ ...entry, stage })) };
}
