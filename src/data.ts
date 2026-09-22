// 数据层：类型定义、种子数据、localStorage 持久化。不含业务规则和页面。

export type PayType = "self" | "insurance";

export interface ConsumableItem {
  id: string;
  name: string; // 耗材项目
  unitPrice: number; // 单价
  quantity: number; // 数量
  payType: PayType; // 自费 / 医保
  amount: number; // 本次费用 = 单价 × 数量
}

export interface Reversal {
  id: string;
  itemId: string;
  itemName: string;
  amount: number; // 冲销金额（负数）
  originalAmount: number; // 原项目金额（保留）
  reason: string; // 退费原因
  at: string;
}

export interface Version {
  id: string;
  seq: number;
  reason: string; // 更正原因
  at: string;
  items: ConsumableItem[]; // 旧值快照
  total: number;
}

export interface Tooth {
  tooth: string; // 牙位
  patient: string;
  diagnosis: string;
  confirmed: boolean; // 本次费用已确认
  settled: boolean; // 已结账（冻结）
  items: ConsumableItem[];
  reversals: Reversal[];
  versions: Version[];
}

export interface WriteOff {
  id: string;
  amount: number;
  reason: string;
  at: string;
}

export interface Patient {
  name: string;
  arrears: number; // 欠费
  nextVisit: string | null; // 下次复诊日期
  writeOffs: WriteOff[];
}

export interface State {
  teeth: Tooth[];
  patients: Patient[];
}

export interface Conflict {
  tooth: string; // 牙位
  item: string; // 项目
  diff: number; // 差额（重算值 - 原值）
  original: number; // 原值
}

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const nowText = (): string => new Date().toLocaleString("zh-CN");

const item = (
  name: string,
  unitPrice: number,
  quantity: number,
  payType: PayType
): ConsumableItem => ({
  id: uid(),
  name,
  unitPrice,
  quantity,
  payType,
  amount: Math.round(unitPrice * quantity * 100) / 100,
});

export function seedState(): State {
  return {
    teeth: [
      {
        tooth: "#36",
        patient: "王强",
        diagnosis: "慢性根尖周炎 · 封药",
        confirmed: true,
        settled: false,
        items: [
          item("根管锉 #30", 45, 2, "self"),
          item("次氯酸钠冲洗液", 12, 1, "insurance"),
          item("氢氧化钙封药", 30, 1, "self"),
        ],
        reversals: [],
        versions: [],
      },
      {
        tooth: "#11",
        patient: "李芳",
        diagnosis: "外伤后变色 · 充填",
        confirmed: true,
        settled: true,
        items: [
          item("牙胶尖", 25, 3, "insurance"),
          item("根管封闭剂", 80, 1, "self"),
        ],
        reversals: [],
        versions: [],
      },
      {
        tooth: "#46",
        patient: "王强",
        diagnosis: "急性牙髓炎 · 测长",
        confirmed: false,
        settled: false,
        items: [item("根管测量耗材包", 60, 1, "insurance")],
        reversals: [],
        versions: [],
      },
    ],
    patients: [
      { name: "王强", arrears: 0, nextVisit: null, writeOffs: [] },
      // 李芳 #11 已结账：25×3 + 80 = 155 计入欠费
      { name: "李芳", arrears: 155, nextVisit: null, writeOffs: [] },
    ],
  };
}

const STORAGE_KEY = "hxwl04-billing-v1";

export function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as State;
    if (!Array.isArray(parsed.teeth) || !Array.isArray(parsed.patients)) {
      return seedState();
    }
    return parsed;
  } catch {
    return seedState();
  }
}

export function saveState(state: State): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
