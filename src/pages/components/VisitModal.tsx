// 页面层：排下次复诊弹窗 —— 患者欠费未清不能排
import { useState } from "react";
import type { AppState, Tooth } from "../../data/types";
import { scheduleVisit } from "../../rules/operations";
import { patientDebt } from "../../rules/billing";
import type { RuleResult } from "../../rules/validations";
import { todayISO, yuan } from "../format";
import { Modal } from "./Modal";

interface VisitModalProps {
  state: AppState;
  tooth: Tooth;
  patientName: string;
  onClose: () => void;
  onApply: (result: RuleResult<AppState>) => true | string;
}

export function VisitModal({ state, tooth, patientName, onClose, onApply }: VisitModalProps) {
  const debt = patientDebt(state, tooth.patientId);
  const [date, setDate] = useState(tooth.nextVisitDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const blocked = debt > 0;

  const submit = () => {
    const outcome = onApply(scheduleVisit(state, tooth.id, date));
    if (outcome === true) {
      onClose();
    } else {
      setError(outcome);
    }
  };

  return (
    <Modal title={`下次复诊 · 牙位 ${tooth.code}`} onClose={onClose}>
      <div className="modal-body">
        <p className="modal-note">患者：{patientName}</p>
        {blocked ? (
          <p className="form-error">
            患者欠费 {yuan(debt)} 未清，不能安排下次复诊。请先在左侧核销欠费。
          </p>
        ) : (
          <label>
            <span>复诊日期（最早 {todayISO()}）</span>
            <input
              type="date"
              min={todayISO()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
      <footer className="modal-foot">
        <button type="button" onClick={onClose}>
          取消
        </button>
        <button type="button" className="primary-action" onClick={submit} disabled={blocked}>
          安排复诊
        </button>
      </footer>
    </Modal>
  );
}
