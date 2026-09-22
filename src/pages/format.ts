// 页面层：展示格式化，不含业务判定。

export function yuan(value: number): string {
  return `${value.toFixed(2)} 元`;
}

export function signedYuan(value: number): string {
  const body = Math.abs(value).toFixed(2);
  if (value > 0) return `+${body} 元`;
  if (value < 0) return `-${body} 元`;
  return "0.00 元";
}

export function payerLabel(value: "self" | "insurance"): string {
  return value === "self" ? "自费" : "医保";
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function todayISO(): string {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
