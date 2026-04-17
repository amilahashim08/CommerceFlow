import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/** Analytics palette: blue, yellow, red (repeats across bars). */
const ANALYTICS_COLORS = {
  blue: '#2563eb',
  yellow: '#eab308',
  red: '#dc2626',
};

const TRIPLE_CYCLE = [ANALYTICS_COLORS.blue, ANALYTICS_COLORS.yellow, ANALYTICS_COLORS.red];

const chartTooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#e2e8f0',
};

export default function SalesAnalytics({ apiBaseUrl }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rangeDays, setRangeDays] = useState(7);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    axios
      .get(`${apiBaseUrl}/api/analytics/charts`, { params: { days: rangeDays } })
      .then((res) => {
        if (cancelled) return;
        if (res.data?.success) setData(res.data);
        else setError('Could not load analytics.');
      })
      .catch(() => {
        if (!cancelled) setError('Could not load sales charts. Is the backend running?');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, rangeDays]);

  const summary = data?.summary;
  const currency = data?.currency || 'USD';

  const hasPaymentActivity = useMemo(() => {
    if (!data?.series?.length) return false;
    return data.series.some((d) => (d.revenue > 0 || d.salesCount > 0));
  }, [data]);

  const showRevenueTopProducts = data?.topProducts?.length > 0;
  const showCatalogLeaderboard = !showRevenueTopProducts && (data?.productLeaderboard?.length > 0);

  return (
    <section className="analytics-section payment-card" aria-label="Sales analytics">
      <div className="analytics-section-head">
        <div>
          <h2>Sales analytics</h2>
          <p className="subtitle">
            Period totals and trends from recorded checkouts. Catalog “units sold” appears when payments updated
            product counters.
          </p>
        </div>
        <div className="analytics-range">
          <label htmlFor="analytics-days">Range</label>
          <select
            id="analytics-days"
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
      </div>

      {loading && <p className="empty-cart">Loading analytics…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && data && (
        <>
          <div className="analytics-kpi-grid">
            <div className="analytics-kpi analytics-kpi--blue">
              <span className="analytics-kpi-label">Revenue ({currency})</span>
              <strong className="analytics-kpi-value">
                {summary ? summary.totalRevenue.toFixed(2) : '0.00'}
              </strong>
            </div>
            <div className="analytics-kpi analytics-kpi--yellow">
              <span className="analytics-kpi-label">Orders</span>
              <strong className="analytics-kpi-value">{summary?.totalOrders ?? 0}</strong>
            </div>
            <div className="analytics-kpi analytics-kpi--red">
              <span className="analytics-kpi-label">Units sold</span>
              <strong className="analytics-kpi-value">{summary?.totalUnits ?? 0}</strong>
            </div>
            <div className="analytics-kpi analytics-kpi--blue">
              <span className="analytics-kpi-label">Avg. order value</span>
              <strong className="analytics-kpi-value">
                {summary && summary.totalOrders > 0 ? summary.avgOrderValue.toFixed(2) : '—'}
              </strong>
            </div>
          </div>

          {!hasPaymentActivity && (
            <p className="analytics-hint">
              No checkout sales in this date range yet. Charts below show zeros for the period. Complete a test
              payment to populate revenue, or see catalog popularity if products have sold counts.
            </p>
          )}

          <div className="analytics-charts">
            <div className="analytics-chart-card analytics-chart-card--blue">
              <h3>Daily revenue ({currency})</h3>
              <div className="analytics-legend">
                <span className="analytics-legend-item analytics-legend-blue">Blue</span>
                <span className="analytics-legend-item analytics-legend-yellow">Yellow</span>
                <span className="analytics-legend-item analytics-legend-red">Red</span>
                <span className="analytics-legend-hint">bars rotate by day</span>
              </div>
              <div className="analytics-chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Revenue']}
                    />
                    <Bar dataKey="revenue" radius={[6, 6, 0, 0]} name="Revenue">
                      {data.series.map((_, i) => (
                        <Cell key={`rev-${i}`} fill={TRIPLE_CYCLE[i % 3]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="analytics-chart-card analytics-chart-card--yellow">
              <h3>Units sold per day</h3>
              <div className="analytics-legend">
                <span className="analytics-legend-item analytics-legend-blue">Blue</span>
                <span className="analytics-legend-item analytics-legend-yellow">Yellow</span>
                <span className="analytics-legend-item analytics-legend-red">Red</span>
              </div>
              <div className="analytics-chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar dataKey="unitsSold" radius={[6, 6, 0, 0]} name="Units">
                      {data.series.map((_, i) => (
                        <Cell key={`units-${i}`} fill={TRIPLE_CYCLE[(i + 1) % 3]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {showRevenueTopProducts && (
              <div className="analytics-chart-card analytics-chart-wide analytics-chart-card--red">
                <h3>Top products by revenue ({currency}) — this period</h3>
                <div className="analytics-chart-wrap analytics-horizontal">
                  <ResponsiveContainer width="100%" height={Math.max(220, data.topProducts.length * 36)}>
                    <BarChart
                      layout="vertical"
                      data={data.topProducts}
                      margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tick={{ fill: '#cbd5e1', fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(v, name) =>
                          name === 'revenue' ? [`$${Number(v).toFixed(2)}`, 'Revenue'] : [v, 'Units']
                        }
                      />
                      <Bar dataKey="revenue" radius={[0, 6, 6, 0]} name="revenue">
                        {data.topProducts.map((_, i) => (
                          <Cell key={`top-rev-${i}`} fill={TRIPLE_CYCLE[i % 3]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {showCatalogLeaderboard && (
              <div className="analytics-chart-card analytics-chart-wide analytics-chart-card--multi">
                <h3>Top products by units sold (catalog)</h3>
                <p className="analytics-chart-note">
                  From product <code>soldCount</code> in the database (updates when payments are recorded against
                  products).
                </p>
                <div className="analytics-chart-wrap analytics-horizontal">
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(220, (data.productLeaderboard?.length || 1) * 36)}
                  >
                    <BarChart
                      layout="vertical"
                      data={data.productLeaderboard}
                      margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tick={{ fill: '#cbd5e1', fontSize: 11 }}
                      />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Bar dataKey="unitsSold" radius={[0, 6, 6, 0]} name="Units">
                        {(data.productLeaderboard || []).map((_, i) => (
                          <Cell key={`cat-${i}`} fill={TRIPLE_CYCLE[(i + 2) % 3]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
