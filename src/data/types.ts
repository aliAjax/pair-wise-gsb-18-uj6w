// 数据层：牙位耗材计费 / 欠费核销领域结构
// 只描述数据形状，不含任何业务规则与界面逻辑。

export type Payer = "self" | "insurance";

export type ToothStage = "开髓" | "测长" | "封药" | "充填";

export type ToothStatus = "open" | "settled";

/** 患者 */
export interface Patient {
  id: string;
  name: string;
}

/**
 * 耗材项目快照。
 * amount 为登记时留存的“本次费用”，恒等于单价 × 数量；
 * 单独留存是为了刷新后做对账冲突检测。
 */
export interface ItemSnapshot {
  id: string;
  /** 耗材项目 */
  name: string;
  /** 单价（元） */
  unitPrice: number;
  /** 数量 */
  quantity: number;
  /** 自费 / 医保 */
  payer: Payer;
  /** 本次费用（留存金额） */
  amount: number;
}

/** 已登记到牙位上的耗材项目 */
export interface ChargeItem extends ItemSnapshot {
  createdAt: string;
}

/**
 * 退费冲销：只追加、不改原项目。
 * amount 为正数，计费时按扣减处理。
 */
export interface Reversal {
  id: string;
  itemId: string;
  itemName: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export type ChangeField = "name" | "unitPrice" | "quantity" | "payer";

/** 登记/更正时提交的耗材字段（无 id、无留存金额） */
export interface DraftItemLike {
  name: string;
  unitPrice: number;
  quantity: number;
  payer: Payer;
}

/** 更正版本中的单字段变更，保留原值并记录费用差额 */
export interface CorrectionChange {
  itemId: string;
  itemName: string;
  field: ChangeField;
  oldValue: string | number;
  newValue: string | number;
  /** 新值相对原值的费用差额（元）；不影响金额的变更为 0 */
  difference: number;
}

/** 已结账牙位的更正版本：带原因、保留旧值 */
export interface CorrectionVersion {
  id: string;
  reason: string;
  createdAt: string;
  before: ItemSnapshot[];
  after: ItemSnapshot[];
  changes: CorrectionChange[];
}

/** 牙位（计费与冻结的主体） */
export interface Tooth {
  id: string;
  patientId: string;
  /** 牙位，如 #36 */
  code: string;
  diagnosis: string;
  stage: ToothStage;
  status: ToothStatus;
  items: ChargeItem[];
  reversals: Reversal[];
  versions: CorrectionVersion[];
  nextVisitDate: string | null;
  createdAt: string;
  settledAt: string | null;
}

/** 患者缴费 / 欠费核销记录 */
export interface Payment {
  id: string;
  patientId: string;
  amount: number;
  note: string;
  createdAt: string;
}

export interface AppState {
  patients: Patient[];
  teeth: Tooth[];
  payments: Payment[];
}

/** 冲突对账行：牙位、项目、差额、原值 */
export interface Conflict {
  toothCode: string;
  item: string;
  /** 差额（元），正值表示当前值高于原值/应有值 */
  difference: number;
  original: string;
  detail: string;
}
