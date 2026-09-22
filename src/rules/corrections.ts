// 规则层：冻结牙位的更正版本。
// 已结账牙位冻结：更正不改旧数据，而是新建一条带原因的版本，
// 版本里完整保留更正前旧值，并按项目逐字段列出差额。

import type {
  ChangeField,
  CorrectionChange,
  CorrectionVersion,
  DraftItemLike,
  ItemSnapshot,
  Tooth,
} from "../data/types";
import { lineAmount, round2 } from "./money";
import { validateItemDraft, type RuleResult } from "./validations";

export const FIELD_LABELS: Record<ChangeField, string> = {
  name: "耗材项目",
  unitPrice: "单价",
  quantity: "数量",
  payer: "结算方式",
};

function snapshot(item: {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  payer: ItemSnapshot["payer"];
  amount: number;
}): ItemSnapshot {
  return {
    id: item.id,
    name: item.name,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    payer: item.payer,
    amount: item.amount,
  };
}

export function toothSnapshots(tooth: Tooth): ItemSnapshot[] {
  return tooth.items.map(snapshot);
}

function sameSnapshot(a: ItemSnapshot, b: ItemSnapshot): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.unitPrice === b.unitPrice &&
    a.quantity === b.quantity &&
    a.payer === b.payer &&
    a.amount === b.amount
  );
}

/**
 * 按项目逐字段比较新旧快照，产出变更行。
 * 单价差额按新数量计、数量差额按旧单价计，合计即为费用总差额。
 */
export function diffSnapshots(before: ItemSnapshot[], after: ItemSnapshot[]): CorrectionChange[] {
  const changes: CorrectionChange[] = [];
  for (const next of after) {
    const old = before.find((entry) => entry.id === next.id);
    if (!old) continue;
    if (old.name !== next.name) {
      changes.push({
        itemId: next.id,
        itemName: next.name,
        field: "name",
        oldValue: old.name,
        newValue: next.name,
        difference: 0,
      });
    }
    if (old.unitPrice !== next.unitPrice) {
      changes.push({
        itemId: next.id,
        itemName: next.name,
        field: "unitPrice",
        oldValue: old.unitPrice,
        newValue: next.unitPrice,
        difference: round2((next.unitPrice - old.unitPrice) * next.quantity),
      });
    }
    if (old.quantity !== next.quantity) {
      changes.push({
        itemId: next.id,
        itemName: next.name,
        field: "quantity",
        oldValue: old.quantity,
        newValue: next.quantity,
        difference: round2((next.quantity - old.quantity) * old.unitPrice),
      });
    }
    if (old.payer !== next.payer) {
      changes.push({
        itemId: next.id,
        itemName: next.name,
        field: "payer",
        oldValue: old.payer,
        newValue: next.payer,
        difference: 0,
      });
    }
  }
  return changes;
}

export interface DraftCorrectionItem extends DraftItemLike {
  id: string;
}

/** 更正预览：校验新值并展示差额，但不产生任何修改 */
export function buildCorrection(
  tooth: Tooth,
  drafts: DraftCorrectionItem[],
  reason: string
): RuleResult<CorrectionVersion> {
  if (tooth.status !== "settled") {
    return { ok: false, error: "仅已结账（冻结）牙位需要更正版本" };
  }
  if (!reason.trim()) return { ok: false, error: "更正必须填写原因" };
  if (drafts.length !== tooth.items.length) {
    return { ok: false, error: "更正不能新增或删除耗材项目" };
  }

  const after: ItemSnapshot[] = [];
  for (const draft of drafts) {
    const check = validateItemDraft(draft);
    if (!check.ok) return check;
    if (!tooth.items.some((item) => item.id === draft.id)) {
      return { ok: false, error: "更正不能新增耗材项目" };
    }
    after.push({
      id: draft.id,
      name: draft.name.trim(),
      unitPrice: draft.unitPrice,
      quantity: draft.quantity,
      payer: draft.payer,
      amount: lineAmount(draft.unitPrice, draft.quantity),
    });
  }

  const before = toothSnapshots(tooth);
  const changes = diffSnapshots(before, after);
  if (changes.length === 0) {
    return { ok: false, error: "没有检测到任何变更" };
  }
  return {
    ok: true,
    value: {
      id: `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      reason: reason.trim(),
      createdAt: new Date().toISOString(),
      before,
      after,
      changes,
    },
  };
}

/** 应用更正：旧值封存在版本里，当前项目替换为新值，冲销记录原样保留 */
export function applyCorrection(tooth: Tooth, version: CorrectionVersion): Tooth {
  return {
    ...tooth,
    items: version.after.map((entry, index) => ({
      ...entry,
      createdAt: tooth.items[index]?.createdAt ?? new Date().toISOString(),
    })),
    versions: [...tooth.versions, version],
  };
}

export function correctionTotalDifference(version: CorrectionVersion): number {
  return round2(version.changes.reduce((sum, change) => sum + change.difference, 0));
}

export { sameSnapshot };
