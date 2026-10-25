'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import type { ExecutiveReport, Recommendation } from '../../lib/recovery/report';

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
const duration = (ms: number | null) =>
  ms === null
    ? '—'
    : ms < 1000
      ? `${Math.round(ms)} ms`
      : ms < 60000
        ? `${(ms / 1000).toFixed(1)} s`
        : `${(ms / 60000).toFixed(1)} min`;
const badge: Record<Recommendation, { text: string; tone: string }> = {
  expand_autonomy: { text: 'Expand autonomy', tone: 'good' },
  keep_human_review: { text: 'Keep human review', tone: 'bad' },
  human_owned: { text: 'Human-owned', tone: 'neutral' },
  gather_evidence: { text: 'Gather evidence', tone: 'neutral' },
};

export default function Report() {
  const [report, setReport] = useState<ExecutiveReport | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    (async () => {
      let r = await fetch('/api/report');
      if (r.status === 401) {
        await fetch('/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        r = await fetch('/api/report');
      }
      if (!r.ok) throw new Error('report_unavailable');
      setReport(await r.json());
    })().catch(() => setError(true));
  }, []);

  const h = report?.headline;
  const objectiveMin = report ? report.objective.recoveryTimeObjectiveMs / 60000 : 15;
  return (
    <main className="document-page report-page" id="main-content">
      <div className="report-actions">
        <Link href="/">← Recovery workspace</Link>
        <button className="button secondary" onClick={() => window.print()}>
          <Printer size={14} />
          Print or save as PDF
        </button>
      </div>
      <div className="eyebrow">EXECUTIVE RESILIENCE REPORT</div>
      <h1>Is the customer journey resilient, and has the AI earned the right to act?</h1>
      <p>
        One page for a leadership committee. It translates incident evidence into recovery against
        the business objective, customer impact, and a decision on where automated recovery can be
        trusted. Every figure is computed from the verified incident record.
      </p>
      {error && (
        <section className="panel">The report could not be loaded. Refresh to try again.</section>
      )}
      {!report && !error && <section className="panel muted">Compiling the report…</section>}
      {report && h && (
        <>
          <section className="stats-grid report-kpis" aria-label="Headline measures">
            <article className="stat-card">
              <div className="stat-label">Recovery objective met</div>
              <div className="stat-value">{pct(h.objectiveAttainment)}</div>
              <p>
                Verified recoveries within the {objectiveMin}-minute recovery time objective (RTO)
              </p>
            </article>
            <article className="stat-card">
              <div className="stat-label">Median time to verified recovery</div>
              <div className="stat-value">{duration(h.medianTimeToVerifiedRecoveryMs)}</div>
              <p>
                From fault to a proven customer journey · detection{' '}
                {duration(h.medianTimeToDetectMs)} · worst{' '}
                {duration(h.worstTimeToVerifiedRecoveryMs)}
              </p>
            </article>
            <article className="stat-card">
              <div className="stat-label">AI autonomy rate</div>
              <div className="stat-value">{pct(h.autonomyRate)}</div>
              <p>
                {h.autonomousRecoveries} resolved by the agent · {h.escalatedToHumans} escalated to
                humans · {h.operatorRestores} operator restores (never counted as AI success)
              </p>
            </article>
            <article className="stat-card">
              <div className="stat-label">Customer journey success</div>
              <div className="stat-value">{pct(report.customerImpact.journeySuccessRate)}</div>
              <p>
                {report.customerImpact.failedCustomerAttempts} failed customer attempts ·{' '}
                {report.customerImpact.reservationsPreserved} reservations preserved
              </p>
            </article>
          </section>

          <section className="panel report-decisions">
            <h2>Decisions for the leadership team</h2>
            <ol>
              {report.decisions.map(d => (
                <li key={d}>{d}</li>
              ))}
            </ol>
            {!h.incidents && (
              <p className="muted">
                <Link href="/">Run a guided recovery drill</Link> to generate the first evidence.
              </p>
            )}
          </section>

          {report.faultClasses.length > 0 && (
            <section className="panel">
              <h2>Where autonomy is earned</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Failure class</th>
                      <th>Incidents</th>
                      <th>Agent recovered</th>
                      <th>Escalated</th>
                      <th>Median recovery</th>
                      <th>Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.faultClasses.map(c => (
                      <tr key={c.fault}>
                        <td>
                          <strong>{c.label}</strong>
                          <small className="report-rationale">{c.rationale}</small>
                        </td>
                        <td>{c.incidents}</td>
                        <td>{c.autonomousRecoveries}</td>
                        <td>{c.escalations}</td>
                        <td>{duration(c.medianRecoveryMs)}</td>
                        <td>
                          <span className={`badge ${badge[c.recommendation].tone}`}>
                            {badge[c.recommendation].text}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="panel">
            <h2>How to read this report</h2>
            <ul>
              {report.caveats.map(c => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="task-meta">
              Generated {new Date(report.generatedAt).toLocaleString()} ·{' '}
              <a href="/api/report">machine-readable version</a> ·{' '}
              <a href="/api/evidence">full evidence package</a>
            </p>
          </section>
        </>
      )}
    </main>
  );
}
