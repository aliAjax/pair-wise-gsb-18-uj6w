// 临时验证脚本：跑规则层关键约束，不进入应用产物
import { cloneState } from "../src/data/repository";
import { seedState } from "../src/data/seed";
import { addItem, correctTooth, recordPayment, reverseItem, scheduleVisit, settleTooth } from "../src/rules/operations";
import { patientDebt, toothCharged, toothGross } from "../src/rules/billing";
import { detectConflicts } from "../src/rules/conflicts";
import type { AppState } from "../src/data/types";

let passed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (!cond) throw new Error(`FAIL: ${name} ${detail}`);
  passed += 1;
  console.log(`PASS: ${name}`);
}

let state: AppState = cloneState(seedState);

// 1) 缺耗材 / 价格非正 / 数量非正 不能确认
const noName = addItem(state, "t-36", { name: "  ", unitPrice: 10, quantity: 1, payer: "self" });
check("缺耗材不能确认", !noName.ok);
const badPrice = addItem(state, "t-36", { name: "冲洗针", unitPrice: 0, quantity: 1, payer: "self" });
check("价格非正不能确认", !badPrice.ok);
const negPrice = addItem(state, "t-36", { name: "冲洗针", unitPrice: -5, quantity: 1, payer: "self" });
check("负价不能确认", !negPrice.ok);
const badQty = addItem(state, "t-36", { name: "冲洗针", unitPrice: 10, quantity: 0, payer: "self" });
check("数量非正不能确认", !badQty.ok);

const added = addItem(state, "t-36", { name: "一次性器械盒", unitPrice: 15.5, quantity: 2, payer: "insurance" });
check("正常登记成功", added.ok);
if (added.ok) state = added.value;
const t36 = state.teeth.find((t) => t.id === "t-36")!;
check("本次费用=单价×数量", t36.items.at(-1)!.amount === 31);

// 2) 欠费未清不能排复诊；p-3 欠费 75
const debtP3 = patientDebt(state, "p-3");
check("p3 有欠费", debtP3 === 75, `debt=${debtP3}`);
const blockedVisit = scheduleVisit(state, "t-46", "2026-10-01");
check("欠费未清不能排复诊", !blockedVisit.ok);

// 超额缴费被拒
const overPay = recordPayment(state, "p-3", 100, "");
check("缴费不能超过欠费", !overPay.ok);
const pay = recordPayment(state, "p-3", 75, "核销");
check("足额核销成功", pay.ok);
if (pay.ok) state = pay.value;
check("核销后欠费为零", patientDebt(state, "p-3") === 0);
const visit = scheduleVisit(state, "t-46", "2026-10-01");
check("欠费清后可排复诊", visit.ok);
if (visit.ok) state = visit.value;
check("复诊日期已保存", state.teeth.find((t) => t.id === "t-46")!.nextVisitDate === "2026-10-01");

// 3) 退费只生成带原因冲销，原项目金额保留；无原因被拒
const before = state.teeth.find((t) => t.id === "t-36")!;
const itemId = before.items[0].id;
const originalAmount = before.items[0].amount;
const noReason = reverseItem(state, "t-36", itemId, 30, "  ");
check("退费无原因被拒", !noReason.ok);
const tooMuch = reverseItem(state, "t-36", itemId, 999, "原因");
check("冲销超额被拒", !tooMuch.ok);
const reversed = reverseItem(state, "t-36", itemId, 30, "患者未使用一支");
check("带原因冲销成功", reversed.ok);
if (reversed.ok) state = reversed.value;
const after = state.teeth.find((t) => t.id === "t-36")!;
check("原项目金额保留", after.items.find((i) => i.id === itemId)!.amount === originalAmount);
check("冲销记录已生成且扣减应收", after.reversals.length === 1 && toothCharged(after) === toothGross(after) - 30);

// 4) 已结账牙位冻结：不能加耗材/改阶段；更正新建带原因版本，保留旧值
const settled = settleTooth(state, "t-36");
check("结账成功", settled.ok);
if (settled.ok) state = settled.value;
const frozenAdd = addItem(state, "t-36", { name: "x", unitPrice: 1, quantity: 1, payer: "self" });
check("结账后不能新增耗材", !frozenAdd.ok);

const frozenTooth = state.teeth.find((t) => t.id === "t-36")!;
const drafts = frozenTooth.items.map((i) => ({ id: i.id, name: i.name, unitPrice: i.unitPrice, quantity: i.quantity, payer: i.payer }));
drafts[0].unitPrice = 25; // 原 30，数量 2 → 差额 -10
const noReasonCorrect = correctTooth(state, "t-36", drafts, "");
check("更正无原因被拒", !noReasonCorrect.ok);
const noChangeCorrect = correctTooth(state, "t-36", frozenTooth.items.map((i) => ({ id: i.id, name: i.name, unitPrice: i.unitPrice, quantity: i.quantity, payer: i.payer })), "原因");
check("无变更不能生成版本", !noChangeCorrect.ok);
const corrected = correctTooth(state, "t-36", drafts, "单价录错，核对后更正");
check("更正生成版本", corrected.ok);
if (corrected.ok) state = corrected.value;
const correctedTooth = state.teeth.find((t) => t.id === "t-36")!;
check("版本数为 1", correctedTooth.versions.length === 1);
check("版本保留旧值 30", correctedTooth.versions[0].before[0].unitPrice === 30);
check("版本记录新值 25", correctedTooth.versions[0].after[0].unitPrice === 25);
check("版本差额 -10", correctedTooth.versions[0].changes[0].difference === -10);
check("当前项目为新值", correctedTooth.items[0].unitPrice === 25);
check("冲销记录保留", correctedTooth.reversals.length === 1);
// 第二次更正形成版本链
const drafts2 = correctedTooth.items.map((i) => ({ id: i.id, name: i.name, unitPrice: i.unitPrice, quantity: i.quantity, payer: i.payer }));
drafts2[1].quantity = 2; // 氢氧化钙 80 元 1->2，差额 +80
const corrected2 = correctTooth(state, "t-36", drafts2, "补登一支");
check("第二次更正成功", corrected2.ok);
if (corrected2.ok) state = corrected2.value;

// 5) 刷新一致性：正常操作零冲突
let conflicts = detectConflicts(state.teeth);
check("正常操作零冲突", conflicts.length === 0, `conflicts=${JSON.stringify(conflicts)}`);

// 持久化往返
const raw = JSON.stringify(state);
const round: AppState = JSON.parse(raw);
check("序列化往返一致", detectConflicts(round.teeth).length === 0);

// 6) 人为篡改留存金额 -> 冲突列出牙位、项目、差额、原值
const tampered = cloneState(state);
const target = tampered.teeth.find((t) => t.id === "t-36")!;
target.items[1].amount = 200; // 应为 80*2=160 → 差额 +40
conflicts = detectConflicts(tampered.teeth);
check("篡改金额检出冲突", conflicts.length >= 1);
const amountConflict = conflicts.find(
  (c) =>
    c.toothCode === "#36" &&
    c.item === target.items[1].name &&
    c.difference === 40 &&
    c.original.includes("200.00")
);
check("冲突列出牙位、项目、差额和原值", !!amountConflict, JSON.stringify(conflicts));

// 篡改版本旧值 -> 版本链断裂冲突
const tampered2 = cloneState(state);
tampered2.teeth.find((t) => t.id === "t-36")!.versions[0].before[0].unitPrice = 99;
conflicts = detectConflicts(tampered2.teeth);
check("篡改版本旧值检出冲突", conflicts.length > 0);

// 冲销超额冲突
const tampered3 = cloneState(state);
tampered3.teeth.find((t) => t.id === "t-11")!.reversals[0].amount = 9999;
conflicts = detectConflicts(tampered3.teeth);
check("超额冲销检出冲突", conflicts.some((c) => c.detail.includes("超过原项目金额")));

console.log(`\n全部 ${passed} 项规则验证通过`);
