// 页面层：退费弹窗 —— 只生成带原因的冲销，保留原项目金额
import { useState } from "react";
import type { AppState, ChargeItem, Tooth } from "../../data/types";
import { reverseItem } from "../../rules/operations";
import { itemRefundable } from "../../rules/billing";
import type { RuleResult } from "../../rules/validations";
import { yuan } from "../format";
import { Modal } from "./Modal";

interface RefundModalProps {
  state: AppState;
  tooth: Tooth;
  item: ChargeItem;
  onClose: () => void;
  onApply: (result: RuleResult<AppState>) => true | string;
}

export function RefundModal({ state, tooth, item, onClose, onApply }: RefundModalProps) {
  const refundable = itemRefundable(tooth, item);
  const [amount, setAmount] = useState(String(refundable));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const outcome = onApply(reverseItem(state, tooth.id, item.id, Number(amount), reason));
    if (outcome === true) {
      onClose();
    } else {
      setError(outcome);
    }
  };

  return (
    <Modal title={`退费冲销 · ${item.name}`} onClose={onClose}>
      <div className="modal-body">
        <p className="modal-note">
          原项目金额 {yuan(item.amount)} 保留不动，本次只登记一条冲销；该项目可退 {yuan(refundable)}。
        </p>
        <label>
          <span>冲销金额（元）</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label>
          <span>退费原因（必填）</span>
          <textarea
            rows={3}
            placeholder="如：耗材未拆封退回"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
      </div>
      <footer className="modal-foot">
        <button type="button" onClick={onClose}>
          取消
        </button>
        <button type="button" className="primary-action warn" onClick={submit}>
          生成冲销
        </button>
      </footer>
    </Modal>
  );
}
