// 规则层：纯函数业务规则，不依赖页面与存储。

import {
  Conflict,
  ConsumableItem,
  Patient,
  Reversal,
  State,
  Tooth,
  Version,
  nowText,
  uid,
} from "./data";

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const lineAmount = (i: ConsumableItem): number =>
  round2(i.unitPrice * i.quantity);

export const itemsTotal = (items: ConsumableItem[]): number =>
  round2(items.reduce((s, i) => s + i.amount, 0));

/** 牙位净费用 = 项目合计 + 冲销合计（冲销为负） */
export const toothNet = (t: Tooth): number =>
  round2(itemsTotal(t.items) + t.reversals.reduce((s, r) => s + r.amount, 0));

/** 确认校验：缺耗材、价格非正、数量非正均不能确认 */
export function confirmErrors(items: ConsumableItem[]): string[] {
  const errors: string[] = [];
  if (items.length === 0) errors.push("缺少耗材项目，不能确认");
  items.forEach((i, idx) => {
    const label = i.name.trim() || `第 ${idx + 1} 行`;
    if (!i.name.trim()) errors.push(`第 ${idx + 1} 行缺少耗材名称`);
    if (!(i.unitPrice > 0)) errors.push(`「${label}」单价必须为正数`);
    if (!(i.quantity > 0)) errors.push(`「${label}」数量必须为正数`);
  });
  return errors;
}

/** 欠费未清不能排下次复诊 */
export function scheduleError(patient: Patient, date: string): string | null {
  if (!date) return "请选择复诊日期";
  if (patient.arrears > 0)
    return `欠费 ¥${patient.arrears.toFixed(2)} 未清，不能排下次复诊`;
  return null;
}

/** 退费：只生成带原因的冲销，原项目金额保留不动 */
export function makeReversal(
  item: ConsumableItem,
  reason: string
): Reversal {
  return {
    id: uid(),
    itemId: item.id,
    itemName: item.name,
    amount: -item.amount,
    originalAmount: item.amount,
    reason,
    at: nowText(),
  };
}

export function refundError(t: Tooth, itemId: string): string | null {
  if (!t.confirmed) return "费用未确认，不能退费";
  if (t.reversals.some((r) => r.itemId === itemId))
    return "该项目已退费，不能重复冲销";
  return null;
}

/** 已结账牙位冻结：更正只新建带原因的版本，旧值存入 versions */
export function makeCorrection(
  t: Tooth,
  nextItems: ConsumableItem[],
  reason: string
): { version: Version; items: ConsumableItem[] } {
  const version: Version = {
    id: uid(),
    seq: t.versions.length + 1,
    reason,
    at: nowText(),
    items: t.items.map((i) => ({ ...i })),
    total: itemsTotal(t.items),
  };
  return { version, items: nextItems.map((i) => ({ ...i })) };
}

/** 核销欠费校验 */
export function writeOffError(patient: Patient, amount: number): string | null {
  if (!(amount > 0)) return "核销金额必须为正数";
  if (amount > patient.arrears)
    return `核销金额不能超过欠费 ¥${patient.arrears.toFixed(2)}`;
  return null;
}

/** 患者应收欠费 = 已结账牙位净费用合计 - 已核销合计 */
export function expectedArrears(state: State, name: string): number {
  const settled = state.teeth
    .filter((t) => t.settled && t.patient === name)
    .reduce((s, t) => s + toothNet(t), 0);
  const writtenOff = state.patients
    .filter((p) => p.name === name)
    .flatMap((p) => p.writeOffs)
    .reduce((s, w) => s + w.amount, 0);
  return round2(settled - writtenOff);
}

/**
 * 一致性核对（刷新后执行）：
 * 1. 项目金额 vs 单价×数量
 * 2. 版本快照总额 vs 快照项目合计
 * 3. 冲销原值 vs 现项目金额
 * 4. 患者欠费 vs 已结账净费用 - 已核销
 */
export function reconcile(state: State): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const t of state.teeth) {
    for (const i of t.items) {
      const expected = lineAmount(i);
      if (expected !== i.amount) {
        conflicts.push({
          tooth: t.tooth,
          item: i.name,
          diff: round2(expected - i.amount),
          original: i.amount,
        });
      }
    }
    for (const v of t.versions) {
      const expected = itemsTotal(v.items);
      if (expected !== v.total) {
        conflicts.push({
          tooth: t.tooth,
          item: `版本 v${v.seq} 合计`,
          diff: round2(expected - v.total),
          original: v.total,
        });
      }
    }
    for (const r of t.reversals) {
      const cur = t.items.find((i) => i.id === r.itemId);
      if (cur && cur.amount !== r.originalAmount) {
        conflicts.push({
          tooth: t.tooth,
          item: `冲销「${r.itemName}」原值`,
          diff: round2(cur.amount - r.originalAmount),
          original: r.originalAmount,
        });
      }
    }
  }
  for (const p of state.patients) {
    const expected = expectedArrears(state, p.name);
    if (expected !== round2(p.arrears)) {
      conflicts.push({
        tooth: "全部",
        item: `${p.name} 欠费`,
        diff: round2(expected - p.arrears),
        original: round2(p.arrears),
      });
    }
  }
  return conflicts;
}
