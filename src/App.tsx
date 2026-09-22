// 页面层：只负责渲染与交互，数据在 data.ts，规则在 rules.ts。
import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  ConsumableItem,
  Patient,
  State,
  Tooth,
  loadState,
  nowText,
  saveState,
  uid,
} from "./data";
import {
  confirmErrors,
  itemsTotal,
  lineAmount,
  makeCorrection,
  makeReversal,
  reconcile,
  refundError,
  round2,
  scheduleError,
  toothNet,
  writeOffError,
} from "./rules";

type Tab = "board" | "billing" | "arrears" | "audit";

const money = (n: number) => `¥${n.toFixed(2)}`;

function toothStatus(t: Tooth): { text: string; cls: string } {
  if (t.settled) return { text: "已结账 · 冻结", cls: "tag frozen" };
  if (t.confirmed) return { text: "已确认", cls: "tag ok" };
  return { text: "登记中", cls: "tag draft" };
}

export default function App() {
  const [state, setState] = useState<State>(loadState);
  const [tab, setTab] = useState<Tab>("board");
  const [selected, setSelected] = useState<string>(state.teeth[0]?.tooth ?? "");

  // 每次变更即持久化，保证刷新后牙位、耗材、费用、冲销、版本一致
  useEffect(() => saveState(state), [state]);

  const conflicts = useMemo(() => reconcile(state), [state]);
  const tooth = state.teeth.find((t) => t.tooth === selected) ?? state.teeth[0];

  const patchTooth = (toothId: string, fn: (t: Tooth) => Tooth) =>
    setState((s) => ({
      ...s,
      teeth: s.teeth.map((t) => (t.tooth === toothId ? fn(t) : t)),
    }));

  const patchPatient = (name: string, fn: (p: Patient) => Patient) =>
    setState((s) => ({
      ...s,
      patients: s.patients.map((p) => (p.name === name ? fn(p) : p)),
    }));

  const openBilling = (toothId: string) => {
    setSelected(toothId);
    setTab("billing");
  };

  const metrics = [
    { label: "登记中牙位", value: state.teeth.filter((t) => !t.confirmed).length },
    { label: "已结账冻结", value: state.teeth.filter((t) => t.settled).length },
    {
      label: "欠费总额",
      value: money(state.patients.reduce((s, p) => s + p.arrears, 0)),
    },
    {
      label: "冲销 / 版本",
      value: `${state.teeth.reduce((s, t) => s + t.reversals.length, 0)} / ${state.teeth.reduce((s, t) => s + t.versions.length, 0)}`,
    },
  ];

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-04 · 牙体牙髓</p>
          <h1>根管耗材计费与欠费核销台</h1>
          <p className="subtitle">
            按牙位登记耗材项目、单价、数量与自费/医保，确认后结账冻结；
            退费只生成带原因冲销，更正只新建带原因版本；欠费未清不能排复诊。
          </p>
        </div>
        <div className="stack-card">
          <span>一致性核对</span>
          <strong>
            {conflicts.length === 0 ? "✓ 无冲突" : `⚠ ${conflicts.length} 项冲突`}
          </strong>
          <span>刷新后自动重算牙位、费用、冲销与版本</span>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((m, i) => (
          <article className="metric-card" key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={["status-ok", "status-watch", "status-danger", "status-ok"][i]} />
          </article>
        ))}
      </section>

      <nav className="tabs">
        {(
          [
            ["board", "牙位看板"],
            ["billing", "耗材计费"],
            ["arrears", "欠费核销"],
            ["audit", `冲突与版本${conflicts.length ? ` (${conflicts.length})` : ""}`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "tab active" : "tab"}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "board" && <Board state={state} onBill={openBilling} />}
      {tab === "billing" && tooth && (
        <Billing
          tooth={tooth}
          state={state}
          onSelect={setSelected}
          onPatch={patchTooth}
          onPatchPatient={patchPatient}
        />
      )}
      {tab === "arrears" && (
        <Arrears state={state} onPatchPatient={patchPatient} />
      )}
      {tab === "audit" && <Audit state={state} conflicts={conflicts} />}
    </main>
  );
}

/* ---------- 牙位看板 ---------- */

function Board({
  state,
  onBill,
}: {
  state: State;
  onBill: (tooth: string) => void;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>按牙位组织</p>
          <h2>牙位看板</h2>
        </div>
      </div>
      <div className="record-list">
        {state.teeth.map((t) => {
          const st = toothStatus(t);
          return (
            <article key={t.tooth} className="record-card">
              <div className="record-index">{t.tooth}</div>
              <div>
                <h3>
                  {t.patient} · {t.diagnosis}{" "}
                  <span className={st.cls}>{st.text}</span>
                </h3>
                <p>
                  耗材 {t.items.length} 项 · 费用 {money(itemsTotal(t.items))} ·
                  冲销 {t.reversals.length} 笔 · 净额 {money(toothNet(t))} · 版本{" "}
                  {t.versions.length}
                </p>
              </div>
              <button className="primary-action" onClick={() => onBill(t.tooth)}>
                计费
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- 耗材计费 ---------- */

function Billing({
  tooth,
  state,
  onSelect,
  onPatch,
  onPatchPatient,
}: {
  tooth: Tooth;
  state: State;
  onSelect: (tooth: string) => void;
  onPatch: (tooth: string, fn: (t: Tooth) => Tooth) => void;
  onPatchPatient: (name: string, fn: (p: Patient) => Patient) => void;
}) {
  const [draft, setDraft] = useState<ConsumableItem[]>(tooth.items);
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState("");
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [msg, setMsg] = useState("");

  // 切换牙位时重置草稿
  const [lastTooth, setLastTooth] = useState(tooth.tooth);
  if (lastTooth !== tooth.tooth) {
    setLastTooth(tooth.tooth);
    setDraft(tooth.items);
    setCorrecting(false);
    setReason("");
    setRefundFor(null);
    setMsg("");
  }

  const editable = !tooth.settled || correcting;
  const draftErrors = confirmErrors(draft);
  const st = toothStatus(tooth);

  const setRow = (id: string, patch: Partial<ConsumableItem>) =>
    setDraft((rows) =>
      rows.map((r) =>
        r.id === id
          ? { ...r, ...patch, amount: lineAmount({ ...r, ...patch }) }
          : r
      )
    );

  const addRow = () =>
    setDraft((rows) => [
      ...rows,
      { id: uid(), name: "", unitPrice: 0, quantity: 1, payType: "self", amount: 0 },
    ]);

  const saveDraft = () => {
    onPatch(tooth.tooth, (t) => ({ ...t, items: draft, confirmed: false }));
    setMsg("已保存登记，待确认");
  };

  const confirm = () => {
    // 缺耗材或价格非正不能确认
    const errs = confirmErrors(draft);
    if (errs.length) {
      setMsg(`不能确认：${errs[0]}`);
      return;
    }
    onPatch(tooth.tooth, (t) => ({ ...t, items: draft, confirmed: true }));
    setMsg("本次费用已确认");
  };

  const settle = () => {
    if (!tooth.confirmed) {
      setMsg("请先确认本次费用再结账");
      return;
    }
    const net = toothNet(tooth);
    onPatch(tooth.tooth, (t) => ({ ...t, settled: true }));
    onPatchPatient(tooth.patient, (p) => ({
      ...p,
      arrears: round2(p.arrears + net),
    }));
    setMsg(`已结账并冻结，${money(net)} 计入 ${tooth.patient} 欠费`);
  };

  const submitCorrection = () => {
    if (!reason.trim()) {
      setMsg("更正必须填写原因");
      return;
    }
    if (draftErrors.length) {
      setMsg(`不能更正：${draftErrors[0]}`);
      return;
    }
    const { version, items } = makeCorrection(tooth, draft, reason.trim());
    const delta = round2(itemsTotal(items) - itemsTotal(tooth.items));
    onPatch(tooth.tooth, (t) => ({
      ...t,
      items,
      versions: [...t.versions, version],
    }));
    if (delta !== 0) {
      onPatchPatient(tooth.patient, (p) => ({
        ...p,
        arrears: round2(p.arrears + delta),
      }));
    }
    setCorrecting(false);
    setReason("");
    setMsg(`已生成更正版本 v${version.seq}，旧值已保留`);
  };

  const submitRefund = (item: ConsumableItem) => {
    if (!refundReason.trim()) {
      setMsg("退费必须填写原因");
      return;
    }
    const reversal = makeReversal(item, refundReason.trim());
    onPatch(tooth.tooth, (t) => ({ ...t, reversals: [...t.reversals, reversal] }));
    if (tooth.settled) {
      onPatchPatient(tooth.patient, (p) => ({
        ...p,
        arrears: round2(p.arrears + reversal.amount),
      }));
    }
    setRefundFor(null);
    setRefundReason("");
    setMsg(`已生成冲销 ${money(reversal.amount)}，原项目金额保留`);
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>耗材计费</p>
          <h2>
            <select
              value={tooth.tooth}
              onChange={(e) => onSelect(e.target.value)}
              className="tooth-select"
            >
              {state.teeth.map((t) => (
                <option key={t.tooth} value={t.tooth}>
                  {t.tooth} · {t.patient}
                </option>
              ))}
            </select>{" "}
            <span className={st.cls}>{st.text}</span>
          </h2>
        </div>
        {tooth.settled && !correcting && (
          <button onClick={() => { setCorrecting(true); setDraft(tooth.items); }}>
            更正（新建版本）
          </button>
        )}
      </div>

      {tooth.settled && !correcting && (
        <p className="notice">已结账牙位已冻结，不能直接改账；更正将新建带原因的版本并保留旧值。</p>
      )}
      {msg && <p className="notice info">{msg}</p>}

      <table className="grid">
        <thead>
          <tr>
            <th>耗材项目</th>
            <th>单价</th>
            <th>数量</th>
            <th>自费/医保</th>
            <th>本次费用</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {draft.map((r) => (
            <tr key={r.id}>
              <td>
                <input
                  value={r.name}
                  disabled={!editable}
                  placeholder="耗材名称"
                  onChange={(e) => setRow(r.id, { name: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={r.unitPrice}
                  disabled={!editable}
                  onChange={(e) => setRow(r.id, { unitPrice: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={r.quantity}
                  disabled={!editable}
                  onChange={(e) => setRow(r.id, { quantity: Number(e.target.value) })}
                />
              </td>
              <td>
                <select
                  value={r.payType}
                  disabled={!editable}
                  onChange={(e) =>
                    setRow(r.id, { payType: e.target.value as "self" | "insurance" })
                  }
                >
                  <option value="self">自费</option>
                  <option value="insurance">医保</option>
                </select>
              </td>
              <td className="num">{money(r.amount)}</td>
              <td>
                {editable && (
                  <button onClick={() => setDraft((rows) => rows.filter((x) => x.id !== r.id))}>
                    删除
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>合计</td>
            <td className="num">{money(itemsTotal(draft))}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      {editable && (
        <div className="actions">
          <button onClick={addRow}>+ 添加耗材</button>
          {correcting ? (
            <>
              <input
                placeholder="更正原因（必填）"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button className="primary-action" onClick={submitCorrection}>
                提交更正版本
              </button>
              <button onClick={() => { setCorrecting(false); setDraft(tooth.items); }}>
                取消
              </button>
            </>
          ) : (
            <>
              <button onClick={saveDraft}>保存登记</button>
              <button className="primary-action" onClick={confirm}>
                确认本次费用
              </button>
              <button onClick={settle}>结账并冻结</button>
            </>
          )}
        </div>
      )}
      {editable && !correcting && draftErrors.length > 0 && (
        <p className="notice warn">不能确认：{draftErrors.join("；")}</p>
      )}

      <h3>退费冲销</h3>
      {tooth.items.length === 0 && <p className="muted">暂无项目</p>}
      <div className="record-list">
        {tooth.items.map((i) => {
          const err = refundError(tooth, i.id);
          const reversed = tooth.reversals.find((r) => r.itemId === i.id);
          return (
            <div key={i.id} className="row-line">
              <span>
                {i.name} · {money(i.amount)}
                {reversed && (
                  <em className="tag danger">
                    已冲销 {money(reversed.amount)}（{reversed.reason}）
                  </em>
                )}
              </span>
              {!reversed && (
                <>
                  {refundFor === i.id ? (
                    <>
                      <input
                        placeholder="退费原因（必填）"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                      />
                      <button className="primary-action" onClick={() => submitRefund(i)}>
                        生成冲销
                      </button>
                      <button onClick={() => setRefundFor(null)}>取消</button>
                    </>
                  ) : (
                    <button
                      disabled={!!err}
                      title={err ?? ""}
                      onClick={() => setRefundFor(i.id)}
                    >
                      退费
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- 欠费核销 ---------- */

function Arrears({
  state,
  onPatchPatient,
}: {
  state: State;
  onPatchPatient: (name: string, fn: (p: Patient) => Patient) => void;
}) {
  const [dates, setDates] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [msgs, setMsgs] = useState<Record<string, string>>({});

  const say = (name: string, m: string) =>
    setMsgs((s) => ({ ...s, [name]: m }));

  const schedule = (p: Patient) => {
    const date = dates[p.name] ?? "";
    const err = scheduleError(p, date);
    if (err) {
      say(p.name, err);
      return;
    }
    onPatchPatient(p.name, (x) => ({ ...x, nextVisit: date }));
    say(p.name, `已排 ${date} 复诊`);
  };

  const writeOff = (p: Patient) => {
    const amount = Number(amounts[p.name] ?? 0);
    const reason = (reasons[p.name] ?? "").trim();
    const err = writeOffError(p, amount);
    if (err) {
      say(p.name, err);
      return;
    }
    if (!reason) {
      say(p.name, "核销必须填写原因");
      return;
    }
    onPatchPatient(p.name, (x) => ({
      ...x,
      arrears: round2(x.arrears - amount),
      writeOffs: [
        ...x.writeOffs,
        { id: uid(), amount, reason, at: nowText() },
      ],
    }));
    say(p.name, `已核销 ${money(amount)}`);
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>患者欠费</p>
          <h2>欠费核销与复诊</h2>
        </div>
      </div>
      <div className="record-list">
        {state.patients.map((p) => (
          <article key={p.name} className="record-card wide">
            <div>
              <h3>
                {p.name}{" "}
                <span className={p.arrears > 0 ? "tag danger" : "tag ok"}>
                  {p.arrears > 0 ? `欠费 ${money(p.arrears)}` : "无欠费"}
                </span>
              </h3>
              <p>下次复诊：{p.nextVisit ?? "未安排"}</p>
              <div className="actions">
                <input
                  type="date"
                  value={dates[p.name] ?? ""}
                  onChange={(e) =>
                    setDates((s) => ({ ...s, [p.name]: e.target.value }))
                  }
                />
                <button
                  onClick={() => schedule(p)}
                  disabled={p.arrears > 0}
                  title={p.arrears > 0 ? "欠费未清不能排下次复诊" : ""}
                >
                  排下次复诊
                </button>
                <input
                  type="number"
                  placeholder="核销金额"
                  value={amounts[p.name] ?? ""}
                  onChange={(e) =>
                    setAmounts((s) => ({ ...s, [p.name]: e.target.value }))
                  }
                />
                <input
                  placeholder="核销原因（必填）"
                  value={reasons[p.name] ?? ""}
                  onChange={(e) =>
                    setReasons((s) => ({ ...s, [p.name]: e.target.value }))
                  }
                />
                <button
                  className="primary-action"
                  onClick={() => writeOff(p)}
                  disabled={p.arrears <= 0}
                >
                  核销欠费
                </button>
              </div>
              {msgs[p.name] && <p className="notice info">{msgs[p.name]}</p>}
              {p.writeOffs.length > 0 && (
                <p className="muted">
                  核销记录：
                  {p.writeOffs
                    .map((w) => `${money(w.amount)}（${w.reason}，${w.at}）`)
                    .join("；")}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------- 冲突与版本 ---------- */

function Audit({ state, conflicts }: { state: State; conflicts: ReturnType<typeof reconcile> }) {
  const versions = state.teeth.flatMap((t) =>
    t.versions.map((v) => ({ tooth: t.tooth, ...v }))
  );
  const reversals = state.teeth.flatMap((t) =>
    t.reversals.map((r) => ({ tooth: t.tooth, ...r }))
  );

  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p>刷新后自动核对</p>
            <h2>一致性冲突</h2>
          </div>
        </div>
        {conflicts.length === 0 ? (
          <p className="muted">牙位、耗材、费用、冲销与版本一致，无冲突。</p>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>牙位</th>
                <th>项目</th>
                <th>差额</th>
                <th>原值</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c, i) => (
                <tr key={i}>
                  <td>{c.tooth}</td>
                  <td>{c.item}</td>
                  <td className="num">{money(c.diff)}</td>
                  <td className="num">{money(c.original)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>冻结牙位的更正历史</p>
            <h2>版本与冲销</h2>
          </div>
        </div>
        {versions.length === 0 && reversals.length === 0 && (
          <p className="muted">暂无更正版本与退费冲销。</p>
        )}
        <div className="record-list">
          {versions.map((v) => (
            <article key={v.id} className="record-card">
              <div className="record-index accent">v{v.seq}</div>
              <div>
                <h3>
                  {v.tooth} · 更正版本 <span className="tag frozen">{v.at}</span>
                </h3>
                <p>
                  原因：{v.reason} · 旧值合计 {money(v.total)} · 旧项目：
                  {v.items.map((i) => `${i.name} ${money(i.amount)}`).join("、")}
                </p>
              </div>
            </article>
          ))}
          {reversals.map((r) => (
            <article key={r.id} className="record-card">
              <div className="record-index warn">冲</div>
              <div>
                <h3>
                  {r.tooth} · {r.itemName}{" "}
                  <span className="tag danger">{money(r.amount)}</span>
                </h3>
                <p>
                  原因：{r.reason} · 原项目金额 {money(r.originalAmount)} 保留 · {r.at}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
