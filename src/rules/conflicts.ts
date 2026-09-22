// 规则层：刷新后的对账冲突检测。
// 以耗材项目单价×数量为唯一可重算源头，逐牙位核对留存费用、冲销与更正版本链。
// 正常操作永远不产生冲突；冲突说明留存数据被外部改动或导入数据不一致。

import type { Conflict, Tooth } from "../data/types";
import { lineAmount, round2 } from "./money";
import { FIELD_LABELS } from "./corrections";
import { toothGross, toothReversed } from "./billing";
import { sameSnapshot } from "./corrections";

function payerLabel(value: string): string {
  return value === "self" ? "自费" : value === "insurance" ? "医保" : String(value);
}

export function detectConflicts(teeth: Tooth[]): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const tooth of teeth) {
    // 1) 留存金额 vs 单价×数量：列出牙位、项目、差额、原值
    for (const item of tooth.items) {
      const expected = lineAmount(item.unitPrice, item.quantity);
      if (round2(item.amount - expected) !== 0) {
        conflicts.push({
          toothCode: tooth.code,
          item: item.name,
          difference: round2(item.amount - expected),
          original: `留存本次费用 ${item.amount.toFixed(2)} 元`,
          detail: `单价 ${item.unitPrice.toFixed(2)} × 数量 ${item.quantity} 应为 ${expected.toFixed(2)} 元`,
        });
      }
    }

    // 2) 冲销引用：孤儿冲销、冲销超过原项目金额
    for (const reversal of tooth.reversals) {
      const item = tooth.items.find((entry) => entry.id === reversal.itemId);
      if (!item) {
        conflicts.push({
          toothCode: tooth.code,
          item: reversal.itemName,
          difference: reversal.amount,
          original: "原项目金额 0.00 元（项目不存在）",
          detail: `冲销“${reversal.reason}”引用的项目已缺失`,
        });
        continue;
      }
      const reversed = tooth.reversals
        .filter((entry) => entry.itemId === item.id)
        .reduce((sum, entry) => sum + entry.amount, 0);
      if (round2(reversed - item.amount) > 0) {
        conflicts.push({
          toothCode: tooth.code,
          item: item.name,
          difference: round2(reversed - item.amount),
          original: `原项目金额 ${item.amount.toFixed(2)} 元`,
          detail: `累计冲销 ${reversed.toFixed(2)} 元超过原项目金额`,
        });
      }
    }

    // 3) 更正版本链：版本按序衔接、旧值完整保留、差额与留存旧值一致
    let chain = tooth.items.map((item) => ({
      id: item.id,
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      payer: item.payer,
      amount: item.amount,
    }));
    // 从当前值沿版本链倒推，每一步都要与版本留存的旧值吻合
    for (let index = tooth.versions.length - 1; index >= 0; index -= 1) {
      const version = tooth.versions[index];
      for (const after of version.after) {
        const current = chain.find((entry) => entry.id === after.id);
        if (!current || !sameSnapshot(current, after)) {
          conflicts.push({
            toothCode: tooth.code,
            item: after.name,
            difference: round2((current?.amount ?? 0) - after.amount),
            original: `版本“${version.reason}”留存新值 ${after.amount.toFixed(2)} 元`,
            detail: "当前项目与更正版本留存值不一致，版本链断裂",
          });
        }
      }
      chain = version.before.map((entry) => ({ ...entry }));
    }

    // 正向再核一遍：相邻版本 after == 下一版本 before
    for (let index = 0; index < tooth.versions.length - 1; index += 1) {
      const current = tooth.versions[index];
      const next = tooth.versions[index + 1];
      for (const beforeItem of next.before) {
        const linked = current.after.find((entry) => entry.id === beforeItem.id);
        if (!linked || !sameSnapshot(linked, beforeItem)) {
          conflicts.push({
            toothCode: tooth.code,
            item: beforeItem.name,
            difference: round2(beforeItem.amount - (linked?.amount ?? 0)),
            original: `上一版本留存 ${linked ? `${linked.amount.toFixed(2)} 元` : "无此项目"}`,
            detail: "相邻更正版本未衔接，旧值链断裂",
          });
        }
      }
    }

    // 4) 版本内变更行：差额与留存原值核对
    for (const version of tooth.versions) {
      for (const change of version.changes) {
        const beforeItem = version.before.find((entry) => entry.id === change.itemId);
        const afterItem = version.after.find((entry) => entry.id === change.itemId);
        if (!beforeItem || !afterItem) continue;
        let expectedDifference: number | null = null;
        let original = "";
        if (change.field === "unitPrice") {
          expectedDifference = round2(
            (afterItem.unitPrice - beforeItem.unitPrice) * afterItem.quantity
          );
          original = `原值 ${FIELD_LABELS.unitPrice} ${Number(change.oldValue).toFixed(2)} 元`;
        } else if (change.field === "quantity") {
          expectedDifference = round2(
            (afterItem.quantity - beforeItem.quantity) * beforeItem.unitPrice
          );
          original = `原值 ${FIELD_LABELS.quantity} ${String(change.oldValue)}`;
        } else {
          original = `原值 ${payerLabel(String(change.oldValue))}`;
        }
        if (expectedDifference !== null && round2(change.difference - expectedDifference) !== 0) {
          conflicts.push({
            toothCode: tooth.code,
            item: change.itemName,
            difference: round2(change.difference - expectedDifference),
            original,
            detail: `更正“${version.reason}”的${FIELD_LABELS[change.field]}差额与留存旧值不符`,
          });
        }
      }
      // 版本前后总额差应等于各变更行差额之和
      const grossDifference = round2(
        version.after.reduce((sum, entry) => sum + entry.amount, 0) -
          version.before.reduce((sum, entry) => sum + entry.amount, 0)
      );
      const changeSum = round2(
        version.changes.reduce((sum, change) => sum + change.difference, 0)
      );
      if (round2(grossDifference - changeSum) !== 0) {
        conflicts.push({
          toothCode: tooth.code,
          item: "（更正版本合计）",
          difference: round2(grossDifference - changeSum),
          original: `变更行差额合计 ${changeSum.toFixed(2)} 元`,
          detail: `更正“${version.reason}”前后总额差为 ${grossDifference.toFixed(2)} 元`,
        });
      }
    }

    // 5) 牙位汇总：冲销合计不能为负、不能超过原费合计
    if (tooth.reversals.some((reversal) => reversal.amount <= 0)) {
      conflicts.push({
        toothCode: tooth.code,
        item: "（冲销记录）",
        difference: 0,
        original: "冲销额应为正数",
        detail: "存在金额非正的冲销记录",
      });
    }
    if (round2(toothReversed(tooth) - toothGross(tooth)) > 0) {
      conflicts.push({
        toothCode: tooth.code,
        item: "（牙位合计）",
        difference: round2(toothReversed(tooth) - toothGross(tooth)),
        original: `原费合计 ${toothGross(tooth).toFixed(2)} 元`,
        detail: `冲销合计 ${toothReversed(tooth).toFixed(2)} 元超过原费合计`,
      });
    }
  }

  return conflicts;
}
