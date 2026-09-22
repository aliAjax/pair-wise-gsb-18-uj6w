import "./styles.css";
import { useMemo, useState } from "react";
import { useAppState } from "./pages/useAppState";
import { PatientPanel } from "./pages/components/PatientPanel";
import { ToothCard } from "./pages/components/ToothCard";
import { ConflictPanel } from "./pages/components/ConflictPanel";
import { detectConflicts } from "./rules/conflicts";
import { patientBillings, totalDebt } from "./rules/billing";
import { yuan } from "./pages/format";

function MetricCard({ label, value, tone }: { label: string; value: string; tone: "ok" | "watch" | "danger" }) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={`status-bar status-${tone}`} />
    </article>
  );
}

function App() {
  const { state, apply, reset } = useAppState();
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);

  const billings = useMemo(() => patientBillings(state), [state]);
  const conflicts = useMemo(() => detectConflicts(state.teeth), [state.teeth]);

  const settledCount = state.teeth.filter((tooth) => tooth.status === "settled").length;
  const pendingVisit = state.teeth.filter(
    (tooth) => tooth.stage !== "充填" && !tooth.nextVisitDate
  ).length;
  const totalCharged = billings.reduce((sum, entry) => sum + entry.charged, 0);
  const patientsInDebt = billings.filter((entry) => entry.debt > 0).length;

  const visibleTeeth = state.teeth.filter(
    (tooth) => !selectedPatient || tooth.patientId === selectedPatient
  );

  const patientName = (id: string) => state.patients.find((patient) => patient.id === id)?.name ?? "未知患者";

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-04 · 根管治疗耗材计费与欠费核销台</p>
          <h1>牙科根管看板</h1>
          <p className="subtitle">
            按牙位登记耗材项目、单价、数量、自费/医保与本次费用；退费只冲销不改正项，结账即冻结，
            更正保留旧值版本，欠费不清不排复诊。
          </p>
        </div>
        <div className="stack-card">
          <span>数据 / 规则 / 页面分层</span>
          <strong>React + TypeScript + localStorage，无新增依赖</strong>
          <button type="button" onClick={reset} className="reset-btn">
            重置为演示数据
          </button>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="在诊牙位" value={String(state.teeth.length - settledCount)} tone="watch" />
        <MetricCard label="已结账冻结" value={String(settledCount)} tone="ok" />
        <MetricCard label="待排复诊" value={String(pendingVisit)} tone="watch" />
        <MetricCard label="患者欠费总额" value={yuan(totalDebt(state))} tone={patientsInDebt > 0 ? "danger" : "ok"} />
        <MetricCard label="应收合计" value={yuan(totalCharged)} tone="ok" />
      </section>

      <section className="workspace">
        <PatientPanel
          state={state}
          selectedId={selectedPatient}
          onSelect={(id) => setSelectedPatient((current) => (current === id ? null : id))}
          onApply={apply}
        />

        <section className="panel teeth-panel">
          <div className="section-heading">
            <div>
              <p>牙位耗材计费</p>
              <h2>
                {selectedPatient ? `${patientName(selectedPatient)} 的牙位` : "全部牙位"}
              </h2>
            </div>
            {selectedPatient && (
              <button type="button" onClick={() => setSelectedPatient(null)}>
                查看全部患者
              </button>
            )}
          </div>
          <div className="tooth-list">
            {visibleTeeth.map((tooth) => (
              <ToothCard
                key={tooth.id}
                state={state}
                tooth={tooth}
                patientName={patientName(tooth.patientId)}
                onApply={apply}
              />
            ))}
            {visibleTeeth.length === 0 && <p className="empty-banner">该患者暂无牙位记录。</p>}
          </div>
        </section>
      </section>

      <ConflictPanel conflicts={conflicts} />

      <footer className="app-footer">
        数据层（localStorage 仓储）· 规则层（登记校验 / 欠费核销 / 冲销 / 冻结更正版本 / 冲突检测）·
        页面层（React 组件），刷新后数据一致。
      </footer>
    </main>
  );
}

export default App;
