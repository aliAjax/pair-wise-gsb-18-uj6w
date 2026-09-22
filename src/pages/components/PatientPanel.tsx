// 页面层：患者欠费核销台
import { useState } from "react";
import type { AppState } from "../../data/types";
import { patientBillings } from "../../rules/billing";
import { recordPayment } from "../../rules/operations";
import type { RuleResult } from "../../rules/validations";
import { yuan } from "../format";

interface PatientPanelProps {
  state: AppState;
  selectedId: string | null;
  onSelect: (patientId: string) => void;
  onApply: (result: RuleResult<AppState>) => true | string;
}

interface RowProps {
  state: AppState;
  billing: ReturnType<typeof patientBillings>[number];
  selectedId: string | null;
  onSelect: (patientId: string) => void;
  onApply: (result: RuleResult<AppState>) => true | string;
}

function PatientRow({ state, billing, selectedId, onSelect, onApply }: RowProps) {
  const { patient, charged, paid, debt, credit } = billing;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const result = recordPayment(state, patient.id, Number(amount), note);
    const outcome = onApply(result);
    if (outcome === true) {
      setAmount("");
      setNote("");
      setError(null);
    } else {
      setError(outcome);
    }
  };

  return (
    <article className={`patient-row ${selectedId === patient.id ? "selected" : ""}`}>
      <button type="button" className="patient-head" onClick={() => onSelect(patient.id)}>
        <strong>{patient.name}</strong>
        <span className={`debt-pill ${debt > 0 ? "danger" : "ok"}`}>
          {debt > 0 ? `欠费 ${yuan(debt)}` : "欠费已清"}
        </span>
      </button>
      <div className="patient-figures">
        <span>应收 {yuan(charged)}</span>
        <span>已缴 {yuan(paid)}</span>
        {credit > 0 && <span className="credit">预缴结余 {yuan(credit)}</span>}
      </div>
      <div className="pay-row">
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="核销金额"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <input
          placeholder="备注（可选）"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <button type="button" className="primary-action small" onClick={submit} disabled={debt <= 0}>
          缴费核销
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </article>
  );
}

export function PatientPanel({ state, selectedId, onSelect, onApply }: PatientPanelProps) {
  const billings = patientBillings(state);

  return (
    <aside className="panel narrow">
      <div className="section-heading compact">
        <div>
          <p>患者欠费核销台</p>
          <h2>患者</h2>
        </div>
      </div>
      <div className="patient-list">
        {billings.map((billing) => (
          <PatientRow
            key={billing.patient.id}
            state={state}
            billing={billing}
            selectedId={selectedId}
            onSelect={onSelect}
            onApply={onApply}
          />
        ))}
      </div>
    </aside>
  );
}
