// 页面层：已结账（冻结）牙位更正弹窗
// 编辑各耗材项目后，预览每个项目的差额与原值，确认后生成带原因的新版本。
import { useMemo, useState } from "react";
import type { AppState, Payer, Tooth } from "../../data/types";
import { correctTooth } from "../../rules/operations";
import { buildCorrection, FIELD_LABELS, type DraftCorrectionItem } from "../../rules/corrections";
import type { RuleResult } from "../../rules/validations";
import { payerLabel, signedYuan, yuan } from "../format";
import { Modal } from "./Modal";

interface CorrectModalProps {
  state: AppState;
  tooth: Tooth;
  onClose: () => void;
  onApply: (result: RuleResult<AppState>) => true | string;
}

export function CorrectModal({ state, tooth, onClose, onApply }: CorrectModalProps) {
  const [drafts, setDrafts] = useState<DraftCorrectionItem[]>(
    tooth.items.map((item) => ({
      id: item.id,
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      payer: item.payer,
    }))
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 预览只做结构与差额校验（占位原因），原因是否填写留给提交时判定
  const preview = useMemo(
    () => buildCorrection(tooth, drafts, "__preview__"),
    [tooth, drafts]
  );

  const update = (id: string, patch: Partial<DraftCorrectionItem>) => {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  };

  const submit = () => {
    const outcome = onApply(correctTooth(state, tooth.id, drafts, reason));
    if (outcome === true) {
      onClose();
    } else {
      setError(outcome);
    }
  };

  return (
    <Modal title={`更正（新版本）· 牙位 ${tooth.code}`} onClose={onClose}>
      <div className="modal-body wide">
        <p className="modal-note">
          牙位已结账冻结：旧值将原样保留，确认后生成一条带原因的更正版本，不覆盖历史。
        </p>
        <div className="correct-list">
          {drafts.map((draft) => {
            const original = tooth.items.find((item) => item.id === draft.id)!;
            return (
              <div className="correct-item" key={draft.id}>
                <div className="correct-item-head">
                  <strong>{original.name}</strong>
                  <span>
                    原本次费用 {yuan(original.amount)}（{payerLabel(original.payer)}）
                  </span>
                </div>
                <div className="correct-grid">
                  <label>
                    <span>耗材项目</span>
                    <input
                      value={draft.name}
                      onChange={(event) => update(draft.id, { name: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>单价</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.unitPrice}
                      onChange={(event) =>
                        update(draft.id, { unitPrice: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>数量</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={draft.quantity}
                      onChange={(event) =>
                        update(draft.id, { quantity: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>结算方式</span>
                    <div className="segmented">
                      {(["self", "insurance"] as Payer[]).map((option) => (
                        <button
                          type="button"
                          key={option}
                          className={draft.payer === option ? "active" : ""}
                          onClick={() => update(draft.id, { payer: option })}
                        >
                          {payerLabel(option)}
                        </button>
                      ))}
                    </div>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="diff-preview">
          <h4>差额预览（牙位 / 项目 / 差额 / 原值）</h4>
          {preview.ok ? (
            <table>
              <thead>
                <tr>
                  <th>牙位</th>
                  <th>项目</th>
                  <th>字段</th>
                  <th className="num">差额</th>
                  <th>原值 → 新值</th>
                </tr>
              </thead>
              <tbody>
                {preview.value.changes.map((change, index) => (
                  <tr key={`${change.itemId}-${change.field}-${index}`}>
                    <td>{tooth.code}</td>
                    <td>{change.itemName}</td>
                    <td>{FIELD_LABELS[change.field]}</td>
                    <td className={`num ${change.difference < 0 ? "neg" : change.difference > 0 ? "pos" : ""}`}>
                      {signedYuan(change.difference)}
                    </td>
                    <td>
                      {change.field === "payer"
                        ? `${payerLabel(change.oldValue as Payer)} → ${payerLabel(change.newValue as Payer)}`
                        : change.field === "unitPrice"
                          ? `${yuan(Number(change.oldValue))} → ${yuan(Number(change.newValue))}`
                          : `${String(change.oldValue)} → ${String(change.newValue)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="form-error">{preview.error}</p>
          )}
        </div>

        <label>
          <span>更正原因（必填）</span>
          <textarea
            rows={2}
            placeholder="如：单价录入有误，经核对后更正"
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
        <button type="button" className="primary-action" onClick={submit} disabled={!preview.ok}>
          生成更正版本
        </button>
      </footer>
    </Modal>
  );
}
