// 规则层：金额基础。统一四舍五入到分，避免浮点误差。

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineAmount(unitPrice: number, quantity: number): number {
  return round2(unitPrice * quantity);
}
