// 页面层：刷新对账冲突面板。正常操作下列表为空；
// 一旦留存的费用、冲销或更正版本与重算结果不一致，列出牙位、项目、差额和原值。
import type { Conflict } from "../../data/types";
import { signedYuan } from "../format";

interface ConflictPanelProps {
  conflicts: Conflict[];
}

export function ConflictPanel({ conflicts }: ConflictPanelProps) {
  return (
    <section className="panel conflicts-panel">
      <div className="section-heading">
        <div>
          <p>刷新后对账</p>
          <h2>冲突核对</h2>
        </div>
        <span className={`conflict-count ${conflicts.length > 0 ? "danger" : "ok"}`}>
          {conflicts.length > 0 ? `${conflicts.length} 项冲突` : "牙位 / 耗材 / 费用 / 冲销 / 版本一致"}
        </span>
      </div>
      {conflicts.length > 0 ? (
        <table className="conflicts-table">
          <thead>
            <tr>
              <th>牙位</th>
              <th>项目</th>
              <th className="num">差额</th>
              <th>原值</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((conflict, index) => (
              <tr key={`${conflict.toothCode}-${conflict.item}-${index}`}>
                <td>{conflict.toothCode}</td>
                <td>{conflict.item}</td>
                <td className={`num ${conflict.difference < 0 ? "neg" : conflict.difference > 0 ? "pos" : ""}`}>
                  {signedYuan(conflict.difference)}
                </td>
                <td>{conflict.original}</td>
                <td className="muted">{conflict.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-banner">未发现冲突：留存费用与单价×数量、冲销额及更正版本链全部一致。</p>
      )}
    </section>
  );
}
