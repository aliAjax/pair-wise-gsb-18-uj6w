// 规则层：登记与操作校验。所有写操作先过这里的规则。

import type { Payer, Tooth } from "../data/types";
import { lineAmount } from "./money";

export interface DraftItem {
  name: string;
  unitPrice: number;
  quantity: number;
  payer: Payer;
}

export type RuleResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** 耗材登记规则：缺耗材（项目名为空）或价格非正不能确认；数量也必须为正 */
export function validateItemDraft(draft: DraftItem): RuleResult {
  if (!draft.name.trim()) return { ok: false, error: "耗材项目不能为空" };
  if (!Number.isFinite(draft.unitPrice) || draft.unitPrice <= 0) {
    return { ok: false, error: "单价必须为正数" };
  }
  if (!Number.isFinite(draft.quantity) || draft.quantity <= 0) {
    return { ok: false, error: "数量必须为正数" };
  }
  if (draft.payer !== "self" && draft.payer !== "insurance") {
    return { ok: false, error: "请选择自费或医保" };
  }
  return { ok: true, value: undefined };
}

/** 结账规则：至少有一项费用、金额为正 */
export function canSettle(tooth: Tooth): RuleResult {
  if (tooth.status === "settled") return { ok: false, error: "牙位已结账，处于冻结状态" };
  if (tooth.items.length === 0) return { ok: false, error: "尚无耗材费用，不能结账" };
  if (tooth.items.some((item) => item.amount <= 0)) {
    return { ok: false, error: "存在非正费用项目，不能结账" };
  }
  return { ok: true, value: undefined };
}

/** 退费规则：只允许带原因冲销，且冲销额不超过该项目剩余可退 */
export function canReverse(
  tooth: Tooth,
  itemId: string,
  amount: number,
  reason: string,
  refundable: number
): RuleResult {
  const item = tooth.items.find((entry) => entry.id === itemId);
  if (!item) return { ok: false, error: "冲销项目不存在" };
  if (!reason.trim()) return { ok: false, error: "退费必须填写原因" };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "退费金额必须为正数" };
  }
  if (amount > refundable) {
    return { ok: false, error: `累计冲销不能超过项目原额（可退 ${refundable.toFixed(2)} 元）` };
  }
  return { ok: true, value: undefined };
}

/** 更正规则：仅已结账（冻结）牙位需要“带原因新版本”；在诊牙位直接改 */
export function canCorrect(tooth: Tooth, reason: string): RuleResult {
  if (tooth.status !== "settled") return { ok: false, error: "仅已结账牙位需要走更正版本" };
  if (!reason.trim()) return { ok: false, error: "更正必须填写原因" };
  return { ok: true, value: undefined };
}

/** 复诊规则：患者欠费未清不能排下次复诊 */
export function canScheduleVisit(debt: number): RuleResult {
  if (debt > 0) {
    return { ok: false, error: `患者欠费 ${debt.toFixed(2)} 元未清，不能安排下次复诊` };
  }
  return { ok: true, value: undefined };
}

/** 缴费规则：金额为正，且不能多缴 */
export function canPay(amount: number, debt: number): RuleResult {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "缴费金额必须为正数" };
  }
  if (debt <= 0) return { ok: false, error: "当前没有欠费需要核销" };
  if (amount > debt) {
    return { ok: false, error: `缴费不能超过欠费 ${debt.toFixed(2)} 元` };
  }
  return { ok: true, value: undefined };
}

export { lineAmount };
