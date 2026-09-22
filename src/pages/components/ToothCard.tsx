// 页面层：牙位卡片 —— 耗材费用、冲销记录、更正版本、结账/复诊操作
import { useState } from "react";
import type { AppState, ChargeItem, Tooth, ToothStage } from "../../data/types";
import type { RuleResult } from "../../rules/validations";
import {
  itemRefundable,
  toothCharged,
  toothGross,
  toothReversed,
  toothSplit,
} from "../../rules/billing";
import { setStage, settleTooth } from "../../rules/operations";
import { correctionTotalDifference, FIELD_LABELS } from "../../rules/corrections";
import { formatDate, payerLabel, signedYuan, yuan } from "../format";
import { ChargeForm } from "./ChargeForm";
import { RefundModal } from "./RefundModal";
import { CorrectModal } from "./CorrectModal";
import { VisitModal } from "./VisitModal";

const STAGES: ToothStage[] = ["开髓", "测长", "封药", "充填"];

function displayValue(field: keyof typeof FIELD_LABELS, value: string | number): string {
  if (field === "payer") return payerLabel(value as "self" | "insurance");
  if (field === "unitPrice") return yuan(Number(value));
  return String(value);
}

interface ToothCardProps {
  state: AppState;
  tooth: Tooth;
  patientName: string;
  onApply: (result: RuleResult<AppState>) => true | string;
}

type ModalState =
  | { kind: "none" }
  | { kind: "refund"; item: ChargeItem }
  | { kind: "correct" }
  | { kind: "visit" };

export function ToothCard({ state, tooth, patientName, onApply }: ToothCardProps) {
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [error, setError] = useState<string | null>(null);
  const settled = tooth.status === "settled";
  const split = toothSplit(tooth);

  const doSettle = () => {
    const outcome = onApply(settleTooth(state, tooth.id));
    if (outcome !== true) setError(outcome);
    else setError(null);
  };

  const changeStage = (stage: ToothStage) => {
    const outcome = onApply(setStage(state, tooth.id, stage));
    if (outcome !== true) setError(outcome);
    else setError(null);
  };

  return (
    <article className={`tooth-card ${settled ? "frozen" : ""}`}>
      <header className="tooth-head">
        <div className="tooth-title">
          <h3>{tooth.code}</h3>
          <span className={`status-badge ${settled ? "settled" : "open"}`}>
            {settled ? "已结账 · 冻结" : "在诊"}
          </span>
        </div>
        <div className="tooth-meta">
          <span>{patientName}</span>
          <span>{tooth.diagnosis}</span>
        </div>
      </header>

      <div className="stage-row">
        {STAGES.map((stage) => (
          <button
            type="button"
            key={stage}
            className={`stage-chip ${tooth.stage === stage ? "active" : ""}`}
            disabled={settled}
            onClick={() => changeStage(stage)}
          >
            {stage}
          </button>
        ))}
        <span className="visit-info">
          下次复诊：
          {tooth.nextVisitDate ? (
            <strong>{tooth.nextVisitDate}</strong>
          ) : (
            <em>未排</em>
          )}
        </span>
      </div>

      <table className="items-table">
        <thead>
          <tr>
            <th>耗材项目</th>
            <th>方式</th>
            <th className="num">单价</th>
            <th className="num">数量</th>
            <th className="num">本次费用</th>
            <th className="action-col">操作</th>
          </tr>
        </thead>
        <tbody>
          {tooth.items.map((item) => {
            const refundable = itemRefundable(tooth, item);
            return (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{payerLabel(item.payer)}</td>
                <td className="num">{item.unitPrice.toFixed(2)}</td>
                <td className="num">{item.quantity}</td>
                <td className="num strong">{yuan(item.amount)}</td>
                <td className="action-col">
                  <button
                    type="button"
                    className="link-btn"
                    disabled={refundable <= 0}
                    onClick={() => setModal({ kind: "refund", item })}
                  >
                    退费
                  </button>
                </td>
              </tr>
            );
          })}
          {tooth.items.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-cell">
                尚未登记耗材
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {tooth.reversals.length > 0 && (
        <div className="reversal-list">
          <h4>退费冲销（原项目金额保留）</h4>
          {tooth.reversals.map((reversal) => (
            <div key={reversal.id} className="reversal-row">
              <span className="reversal-amount">-{yuan(reversal.amount)}</span>
              <span className="reversal-name">{reversal.itemName}</span>
              <span className="reversal-reason">原因：{reversal.reason}</span>
              <span className="reversal-date">{formatDate(reversal.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      {tooth.versions.length > 0 && (
        <div className="version-list">
          <h4>更正版本（保留旧值）</h4>
          {tooth.versions.map((version, index) => (
            <details key={version.id} className="version-row">
              <summary>
                <span>v{index + 1}</span>
                <span>{version.reason}</span>
                <span className={`diff-sum ${correctionTotalDifference(version) < 0 ? "neg" : "pos"}`}>
                  合计 {signedYuan(correctionTotalDifference(version))}
                </span>
                <span className="reversal-date">{formatDate(version.createdAt)}</span>
              </summary>
              <table className="version-table">
                <thead>
                  <tr>
                    <th>项目</th>
                    <th>字段</th>
                    <th>原值</th>
                    <th>新值</th>
                    <th className="num">差额</th>
                  </tr>
                </thead>
                <tbody>
                  {version.changes.map((change, changeIndex) => (
                    <tr key={`${change.itemId}-${changeIndex}`}>
                      <td>{change.itemName}</td>
                      <td>{FIELD_LABELS[change.field]}</td>
                      <td>{displayValue(change.field, change.oldValue)}</td>
                      <td>{displayValue(change.field, change.newValue)}</td>
                      <td className={`num ${change.difference < 0 ? "neg" : change.difference > 0 ? "pos" : ""}`}>
                        {signedYuan(change.difference)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
        </div>
      )}

      <div className="totals-row">
        <span>原费合计 {yuan(toothGross(tooth))}</span>
        <span>冲销 -{yuan(toothReversed(tooth))}</span>
        <span>自费 {yuan(split.self)}</span>
        <span>医保 {yuan(split.insurance)}</span>
        <strong>应收 {yuan(toothCharged(tooth))}</strong>
      </div>

      <ChargeForm state={state} toothId={tooth.id} frozen={settled} onApply={onApply} />

      {error && <p className="form-error">{error}</p>}

      <footer className="tooth-actions">
        {!settled ? (
          <button type="button" className="primary-action" onClick={doSettle}>
            结账并冻结牙位
          </button>
        ) : (
          <button type="button" onClick={() => setModal({ kind: "correct" })}>
            更正（新建带原因版本）
          </button>
        )}
        <button type="button" onClick={() => setModal({ kind: "visit" })}>
          {tooth.nextVisitDate ? "改约复诊" : "排下次复诊"}
        </button>
      </footer>

      {modal.kind === "refund" && (
        <RefundModal
          state={state}
          tooth={tooth}
          item={modal.item}
          onClose={() => setModal({ kind: "none" })}
          onApply={onApply}
        />
      )}
      {modal.kind === "correct" && (
        <CorrectModal
          state={state}
          tooth={tooth}
          onClose={() => setModal({ kind: "none" })}
          onApply={onApply}
        />
      )}
      {modal.kind === "visit" && (
        <VisitModal
          state={state}
          tooth={tooth}
          patientName={patientName}
          onClose={() => setModal({ kind: "none" })}
          onApply={onApply}
        />
      )}
    </article>
  );
}
