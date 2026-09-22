// 页面层：牙位耗材登记（项目、单价、数量、自费/医保、本次费用）
import { useState } from "react";
import type { AppState, Payer } from "../../data/types";
import { addItem } from "../../rules/operations";
import { lineAmount } from "../../rules/money";
import type { RuleResult } from "../../rules/validations";
import { yuan } from "../format";

interface ChargeFormProps {
  state: AppState;
  toothId: string;
  frozen: boolean;
  onApply: (result: RuleResult<AppState>) => true | string;
}

const emptyForm = { name: "", unitPrice: "", quantity: "1", payer: "self" as Payer };

export function ChargeForm({ toothId, frozen, state, onApply }: ChargeFormProps) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const unitPrice = Number(form.unitPrice);
  const quantity = Number(form.quantity);
  const preview =
    Number.isFinite(unitPrice) && Number.isFinite(quantity) && unitPrice > 0 && quantity > 0
      ? lineAmount(unitPrice, quantity)
      : null;

  const submit = () => {
    const result = addItem(state, toothId, {
      name: form.name,
      unitPrice,
      quantity,
      payer: form.payer,
    });
    const outcome = onApply(result);
    if (outcome === true) {
      setForm(emptyForm);
      setError(null);
    } else {
      setError(outcome);
    }
  };

  if (frozen) {
    return (
      <p className="frozen-hint">牙位已结账冻结：新增/修改耗材只能通过“更正”生成带原因的新版本。</p>
    );
  }

  return (
    <div className="charge-form">
      <div className="charge-grid">
        <label>
          <span>耗材项目</span>
          <input
            placeholder="如：根管冲洗液"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          <span>单价（元）</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.unitPrice}
            onChange={(event) => setForm({ ...form, unitPrice: event.target.value })}
          />
        </label>
        <label>
          <span>数量</span>
          <input
            type="number"
            min="0"
            step="1"
            value={form.quantity}
            onChange={(event) => setForm({ ...form, quantity: event.target.value })}
          />
        </label>
        <label>
          <span>结算方式</span>
          <div className="segmented">
            {(["self", "insurance"] as Payer[]).map((option) => (
              <button
                type="button"
                key={option}
                className={form.payer === option ? "active" : ""}
                onClick={() => setForm({ ...form, payer: option })}
              >
                {option === "self" ? "自费" : "医保"}
              </button>
            ))}
          </div>
        </label>
      </div>
      <div className="charge-foot">
        <span className="line-preview">
          本次费用：<strong>{preview === null ? "—" : yuan(preview)}</strong>
        </span>
        <button type="button" className="primary-action" onClick={submit}>
          登记耗材
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
