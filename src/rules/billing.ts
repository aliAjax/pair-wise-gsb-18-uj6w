// 规则层：费用与欠费核算。纯函数，直接从项目 / 冲销 / 缴费重算，不依赖留存汇总。

import type { AppState, ChargeItem, Patient, Tooth } from "../data/types";
import { round2 } from "./money";

/** 牙位耗材原始费用合计（保留原项目金额，冲销不改动它） */
export function toothGross(tooth: Tooth): number {
  return round2(tooth.items.reduce((sum, item) => sum + item.amount, 0));
}

/** 牙位退费冲销合计 */
export function toothReversed(tooth: Tooth): number {
  return round2(tooth.reversals.reduce((sum, reversal) => sum + reversal.amount, 0));
}

/** 牙位应收（本次费用 − 冲销） */
export function toothCharged(tooth: Tooth): number {
  return round2(toothGross(tooth) - toothReversed(tooth));
}

/** 自费 / 医保拆分（按原项目金额，冲销记录不改原项目） */
export function toothSplit(tooth: Tooth): { self: number; insurance: number } {
  const totals = { self: 0, insurance: 0 };
  for (const item of tooth.items) {
    totals[item.payer] += item.amount;
  }
  return { self: round2(totals.self), insurance: round2(totals.insurance) };
}

/** 单个项目已冲销金额 */
export function itemReversed(tooth: Tooth, itemId: string): number {
  return round2(
    tooth.reversals
      .filter((reversal) => reversal.itemId === itemId)
      .reduce((sum, reversal) => sum + reversal.amount, 0)
  );
}

/** 项目可退余额 */
export function itemRefundable(tooth: Tooth, item: ChargeItem): number {
  return round2(item.amount - itemReversed(tooth, item.id));
}

/** 患者全部牙位应收 */
export function patientCharged(state: AppState, patientId: string): number {
  return round2(
    state.teeth
      .filter((tooth) => tooth.patientId === patientId)
      .reduce((sum, tooth) => sum + toothCharged(tooth), 0)
  );
}

/** 患者已缴（欠费核销累计） */
export function patientPaid(state: AppState, patientId: string): number {
  return round2(
    state.payments
      .filter((payment) => payment.patientId === patientId)
      .reduce((sum, payment) => sum + payment.amount, 0)
  );
}

/** 患者欠费：应收 − 已缴，最低为 0（多缴单独提示，不藏进负数） */
export function patientDebt(state: AppState, patientId: string): number {
  return round2(Math.max(0, patientCharged(state, patientId) - patientPaid(state, patientId)));
}

/** 患者预缴结余（>0 表示缴多了） */
export function patientCredit(state: AppState, patientId: string): number {
  return round2(Math.max(0, patientPaid(state, patientId) - patientCharged(state, patientId)));
}

export interface PatientBilling {
  patient: Patient;
  charged: number;
  paid: number;
  debt: number;
  credit: number;
}

export function patientBillings(state: AppState): PatientBilling[] {
  return state.patients.map((patient) => ({
    patient,
    charged: patientCharged(state, patient.id),
    paid: patientPaid(state, patient.id),
    debt: patientDebt(state, patient.id),
    credit: patientCredit(state, patient.id),
  }));
}

export function totalDebt(state: AppState): number {
  return round2(state.patients.reduce((sum, patient) => sum + patientDebt(state, patient.id), 0));
}
