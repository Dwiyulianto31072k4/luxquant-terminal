// src/components/admin/workspace/ProfitSharingTab.jsx
//
// Profit-sharing recap. Pulls confirmed payments for a period, applies the
// per-payment scheme (regular 80/20, Canada 35%→85/15) on the backend, shows
// totals + a per-transaction table, lets an admin re-tag a payment's source,
// and exports the table to CSV (opens in Excel).
//
import { useState, useEffect, useCallback, useMemo } from 'react';
import { workspaceApi } from '../../../services/workspaceApi';
import { palette, tint } from '../designSystem';
import { RefreshIcon, DownloadIcon, LoaderIcon } from '../Icons';

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-CA') : '—';
const isoDaysAgo = (d) => { const t = new Date(); t.setDate(t.getDate() - d); return t.toISOString().slice(0, 10); };

const SCHEME_LABEL = { regular: 'Regular / Indonesia', canada: 'Canada (Sam)' };
const SCHEME_COLOR = { regular: palette.blue[400], canada: palette.teal[400] };

const Stat = ({ label, value, color, sub }) => (
  <div className="rounded-xl p-3.5" style={{ background: 'rgb(var(--surface-raised))', border: `1px solid ${tint(color, 0.18)}` }}>
    <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: tint(color, 0.8) }}>{label}</div>
    <div className="text-[20px] font-bold mt-1 tabular-nums" style={{ color }}>{value}</div>
    {sub && <div className="text-[10px] mt-0.5" style={{ color: 'rgb(var(--fg-muted))' }}>{sub}</div>}
  </div>
);

export const ProfitSharingTab = () => {
  const [from, setFrom] = useState(isoDaysAgo(35));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await workspaceApi.getProfitSharing({ from, to })); }
    catch (e) { console.error('profit-sharing load failed', e); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const retag = useCallback(async (paymentId, source) => {
    setBusy((b) => ({ ...b, [paymentId]: true }));
    try { await workspaceApi.setPaymentPartnerSource(paymentId, source); await load(); }
    catch (e) { window.alert('Tag failed: ' + (e?.response?.data?.detail || e.message)); }
    finally { setBusy((b) => { const n = { ...b }; delete n[paymentId]; return n; }); }
  }, [load]);

  const rows = data?.rows || [];
  const totals = data?.totals || { gross: 0, owner: 0, bigstar: 0, external: 0 };
  const byScheme = data?.by_scheme || {};

  const exportCsv = useMemo(() => () => {
    const head = ['date', 'user', 'method', 'scheme', 'gross_usdt', 'external_sam', 'your_share', 'bigstar_share', 'tx_hash', 'reference'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.join(',')];
    rows.forEach((r) => lines.push([
      fmtDate(r.created_at), r.username || r.user_id, r.method, r.scheme,
      r.gross, r.external, r.owner, r.bigstar, r.tx_hash || '', r.reference || '',
    ].map(esc).join(',')));
    lines.push('');
    lines.push([esc('TOTAL'), '', '', '', esc(totals.gross), esc(totals.external), esc(totals.owner), esc(totals.bigstar), '', ''].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `luxquant_profit_sharing_${from}_to_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [rows, totals, from, to]);

  return (
    <div>
      {/* filter row */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'rgb(var(--fg-muted))' }}>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="text-[12px] rounded-md px-2 py-1.5 outline-none" style={{ background: 'rgb(var(--surface-secondary))', border: `1px solid ${tint(palette.warm[100], 0.14)}`, color: 'rgb(var(--fg))' }} />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'rgb(var(--fg-muted))' }}>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="text-[12px] rounded-md px-2 py-1.5 outline-none" style={{ background: 'rgb(var(--surface-secondary))', border: `1px solid ${tint(palette.warm[100], 0.14)}`, color: 'rgb(var(--fg))' }} />
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold"
          style={{ background: tint(palette.gold[300], 0.1), border: `1px solid ${tint(palette.gold[300], 0.28)}`, color: palette.gold[300] }}>
          <RefreshIcon size={12} className={loading ? 'animate-spin' : ''} /> Apply
        </button>
        <button onClick={exportCsv} disabled={!rows.length} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold disabled:opacity-40 ml-auto"
          style={{ background: tint(palette.green[400], 0.1), border: `1px solid ${tint(palette.green[400], 0.28)}`, color: palette.green[400] }}>
          <DownloadIcon size={12} /> Export CSV
        </button>
      </div>

      {/* totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        <Stat label="Gross total" value={money(totals.gross)} color={palette.gold[300]} sub={`${rows.length} transaksi`} />
        <Stat label="Bagian kamu" value={money(totals.owner)} color={palette.green[400]} sub="owner" />
        <Stat label="Bagian bigstar" value={money(totals.bigstar)} color={palette.blue[400]} sub="partner" />
        <Stat label="Sam (Canada)" value={money(totals.external)} color={palette.teal[400]} sub="external 35%" />
      </div>

      {/* per-scheme */}
      {Object.keys(byScheme).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(byScheme).map(([sc, v]) => (
            <div key={sc} className="rounded-lg px-3 py-2 text-[11px]" style={{ background: 'rgb(var(--ink) / 0.02)', border: `1px solid ${tint(SCHEME_COLOR[sc] || palette.warm[400], 0.25)}` }}>
              <span className="font-semibold" style={{ color: SCHEME_COLOR[sc] || 'rgb(var(--fg-secondary))' }}>{SCHEME_LABEL[sc] || sc}</span>
              <span style={{ color: 'rgb(var(--fg-muted))' }}> · {v.count} tx · gross {money(v.gross)} · kamu {money(v.owner)} · bigstar {money(v.bigstar)}</span>
            </div>
          ))}
        </div>
      )}

      {/* table */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-16 gap-2" style={{ color: 'rgb(var(--fg-muted))' }}>
          <LoaderIcon size={18} className="animate-spin" /> <span className="text-sm">Loading…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color: 'rgb(var(--fg-muted))' }}>Tidak ada pembayaran confirmed di periode ini.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${tint(palette.warm[100], 0.1)}` }}>
          <table className="w-full text-[11.5px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgb(var(--surface-secondary))', color: 'rgb(var(--fg-secondary))' }}>
                {['Tgl', 'User', 'Metode', 'Skema', 'Gross', 'Sam', 'Kamu', 'Bigstar'].map((h) => (
                  <th key={h} className="text-left font-semibold px-2.5 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.payment_id} style={{ borderTop: `1px solid ${tint(palette.warm[100], 0.07)}` }}>
                  <td className="px-2.5 py-1.5 whitespace-nowrap" style={{ color: 'rgb(var(--fg-secondary))' }}>{fmtDate(r.created_at)}</td>
                  <td className="px-2.5 py-1.5 truncate max-w-[140px]" style={{ color: 'rgb(var(--fg))' }}>{r.username || `#${r.user_id}`}</td>
                  <td className="px-2.5 py-1.5" style={{ color: 'rgb(var(--fg-muted))' }}>{r.method}</td>
                  <td className="px-2.5 py-1.5">
                    <select value={r.scheme} disabled={busy[r.payment_id]}
                      onChange={(e) => retag(r.payment_id, e.target.value)}
                      className="text-[11px] rounded px-1.5 py-1 outline-none"
                      style={{ background: 'rgb(var(--surface-secondary))', border: `1px solid ${tint(SCHEME_COLOR[r.scheme] || palette.warm[400], 0.3)}`, color: SCHEME_COLOR[r.scheme] || 'rgb(var(--fg-secondary))' }}>
                      <option value="regular" style={{ background: 'rgb(var(--surface-secondary))', color: 'rgb(var(--fg))' }}>Regular</option>
                      <option value="canada" style={{ background: 'rgb(var(--surface-secondary))', color: 'rgb(var(--fg))' }}>Canada</option>
                    </select>
                  </td>
                  <td className="px-2.5 py-1.5 tabular-nums" style={{ color: palette.gold[300] }}>{money(r.gross)}</td>
                  <td className="px-2.5 py-1.5 tabular-nums" style={{ color: r.external ? palette.teal[400] : 'rgb(var(--fg-muted))' }}>{r.external ? money(r.external) : '—'}</td>
                  <td className="px-2.5 py-1.5 tabular-nums font-semibold" style={{ color: palette.green[400] }}>{money(r.owner)}</td>
                  <td className="px-2.5 py-1.5 tabular-nums" style={{ color: palette.blue[400] }}>{money(r.bigstar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ProfitSharingTab;
