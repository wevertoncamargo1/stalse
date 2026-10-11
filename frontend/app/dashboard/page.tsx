'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCity } from '../format-city';
import { getOperatorHeaders } from '../operator';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

type Metrics = {
  generated_at: string;
  source_file?: string;
  record_type: 'reviews' | 'records';
  summary: {
    total_records: number;
    average_rating: number | null;
  };
  by_day: Array<{
    date: string;
    count: number;
    categories?: Array<{
      category: string;
      count: number;
      ratings?: Array<{ rating: number | string; count: number }> | null;
    }> | null;
  }>;
  by_month: Array<{ month: string; count: number; average_rating: number | null }>;
  by_category: Array<{ category: string; count: number; average_rating?: number | null }>;
  by_rating: Array<{ rating: string; count: number }>;
  orders: {
    summary: {
      total_orders: number;
      delivered: number;
      canceled: number;
      unavailable: number;
      open_tickets: number;
      closed_tickets: number;
    };
    by_status: Array<{ status: string; count: number }>;
    by_ticket_status: Array<{ status: 'open' | 'closed'; count: number }>;
    by_city: Array<{ city: string; state: string; orders: number; customers: number }>;
  };
};

const STATUS_LABELS: Record<string, string> = {
  approved: 'Aprovados',
  canceled: 'Cancelados',
  created: 'Criados',
  delivered: 'Entregues',
  invoiced: 'Faturados',
  processing: 'Em processamento',
  shipped: 'Enviados',
  unavailable: 'Indisponíveis',
};
const STATUS_COLORS: Record<string, string> = {
  created: '#64748b',
  processing: '#f59e0b',
  approved: '#0ea5e9',
  unavailable: '#a855f7',
  invoiced: '#6366f1',
  shipped: '#f27218',
  canceled: '#dc2626',
  delivered: '#16a34a',
};
const RATING_COLORS: Record<string, string> = {
  '5': '#16a34a',
  '4': '#65a30d',
  '3': '#f59e0b',
  '2': '#f97316',
  '1': '#dc2626',
};
const ORANGE = '#f27218';
const INK = '#0b1220';
const GRID = '#eef1f5';
const TICK = { fill: '#64748b', fontSize: 11 };
const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
  fontSize: 12,
};

const count = (value: number | string) => Number(value).toLocaleString('pt-BR');
const percent = (part: number, total: number) =>
  total ? `${((part / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '0%';
const humanize = (value: string) => value.replaceAll('_', ' ');
const chartDataIndex = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
};

function DailyTooltip({
  active,
  payload,
}: TooltipContentProps) {
  const day = payload?.[0]?.payload as Metrics['by_day'][number] | undefined;
  if (!active || !day) return null;
  const dayRatings = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count:
      day.categories?.reduce(
        (sum, category) =>
          sum +
          (category.ratings?.find((item) => Number(item.rating) === rating)?.count ?? 0),
        0
      ) ?? 0,
  }));

  return (
    <div className="daily-tooltip">
      <strong className="daily-tooltip-date">{formatDay(day.date)}</strong>
      <p className="daily-tooltip-total">{count(day.count)} {day.count === 1 ? 'avaliação' : 'avaliações'}</p>
      {day.categories?.some((category) => category.ratings?.length) ? (
        <ul className="rating-list daily-rating-list">
          {dayRatings.map((item) => (
            <li key={item.rating}>
              <span className="rating-label">{item.rating} ★</span>
              <div className="rating-track" aria-hidden="true">
                <i
                  style={{
                    width: `${day.count ? (item.count / day.count) * 100 : 0}%`,
                    background: RATING_COLORS[String(item.rating)] ?? ORANGE,
                  }}
                />
              </div>
              <span className="rating-share">{percent(item.count, day.count)}</span>
              <span className="rating-count">{count(item.count)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="daily-tooltip-unavailable">Distribuição por nota indisponível.</p>
      )}
    </div>
  );
}

function formatMonth(value: string): string {
  return new Date(`${value}-01T12:00:00`)
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    .replace('.', '');
}

function formatDay(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="stars" aria-label={`${value.toLocaleString('pt-BR')} de 5 estrelas`}>
      {'★'.repeat(full)}
      <span>{'★'.repeat(5 - full)}</span>
    </span>
  );
}

function BarList({
  rows,
}: {
  rows: Array<{ key: string; label: string; value: number; color?: string; meta?: string }>;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="bar-list">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="bar-list-head">
            <span className="bar-list-label">{row.label}</span>
            <span className="bar-list-value">
              {count(row.value)}
              {row.meta && <small>{row.meta}</small>}
            </span>
          </div>
          <div className="bar-list-track" aria-hidden="true">
            <i style={{ width: `${Math.max(1.5, (row.value / max) * 100)}%`, background: row.color ?? ORANGE }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);
  const [activeMonthIndex, setActiveMonthIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch(`${API_BASE}/metrics`, { headers: getOperatorHeaders() });
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? 'Métricas ainda não geradas. Rode `python data/etl.py` para criar data/processed/metrics.json.'
              : 'Não foi possível carregar as métricas.'
          );
        }
        setMetrics(await response.json());
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Não foi possível carregar as métricas.');
      } finally {
        setLoading(false);
      }
    };
    void fetchMetrics();
  }, []);

  const derived = useMemo(() => {
    if (!metrics) return null;
    const ratings = [...metrics.by_rating].sort((a, b) => Number(b.rating) - Number(a.rating));
    const totalRatings = ratings.reduce((sum, item) => sum + item.count, 0);
    const fiveStars = ratings.find((item) => Number(item.rating) === 5)?.count ?? 0;
    const lowRatings = ratings
      .filter((item) => Number(item.rating) <= 2)
      .reduce((sum, item) => sum + item.count, 0);
    const peakDay = metrics.by_day.reduce(
      (best, item) => (item.count > best.count ? item : best),
      { date: '', count: 0 }
    );
    const daily = metrics.by_day.map((item, index, all) => {
      const window = all.slice(Math.max(0, index - 6), index + 1);
      return {
        ...item,
        average: Math.round(window.reduce((sum, day) => sum + day.count, 0) / window.length),
      };
    });
    const orderStatus = [...metrics.orders.by_status]
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
    return { ratings, totalRatings, fiveStars, lowRatings, peakDay, orderStatus, daily };
  }, [metrics]);

  if (loading) {
    return (
      <main className="page-shell" aria-busy="true" aria-label="Carregando métricas">
        <div className="skeleton-line skeleton-eyebrow" />
        <div className="skeleton-line skeleton-heading" />
        <section className="dash-kpis" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => (
            <div className="dash-kpi skeleton-metric" key={item}>
              <div className="skeleton-line skeleton-label" />
              <div className="skeleton-line skeleton-value" />
            </div>
          ))}
        </section>
        <section className="dash-grid" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <div className={`panel skeleton-panel ${item === 0 ? 'span-8' : 'span-4'}`} key={item}>
              <div className="skeleton-line skeleton-panel-title" />
              {[0, 1, 2, 3].map((line) => <div className="skeleton-line skeleton-panel-line" key={line} />)}
            </div>
          ))}
        </section>
      </main>
    );
  }

  if (error || !metrics || !derived) {
    return (
      <main className="page-shell">
        <p role="alert" className="inline-error">{error ?? 'Não foi possível carregar as métricas.'}</p>
      </main>
    );
  }

  const { summary, orders } = metrics;
  const { ratings, totalRatings, fiveStars, lowRatings, peakDay, orderStatus, daily } = derived;
  const generatedAt = new Date(metrics.generated_at).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Avaliações e métricas</p>
          <h1>Visão geral da operação</h1>
          <p className="page-subtitle">
            Avaliações processadas pelo ETL em pandas e indicadores ao vivo dos pedidos.
          </p>
        </div>
        <div className="data-source" title="Arquivo lido pelo endpoint GET /metrics">
          <span className="data-source-dot" aria-hidden="true" />
          <div>
            <strong>metrics.json</strong>
            <span>Gerado em {generatedAt}</span>
          </div>
        </div>
      </header>

      <section className="dash-kpis" aria-label="Indicadores principais">
        <article className="dash-kpi is-feature">
          <span className="dash-kpi-label">Nota média</span>
          <div className="dash-kpi-main">
            <strong>{summary.average_rating?.toLocaleString('pt-BR') ?? '—'}</strong>
            <small>/ 5</small>
          </div>
          {summary.average_rating !== null && <Stars value={summary.average_rating} />}
        </article>
        <article className="dash-kpi">
          <span className="dash-kpi-label">Avaliações</span>
          <div className="dash-kpi-main"><strong>{count(summary.total_records)}</strong></div>
          <span className="dash-kpi-foot">
            <b className="is-good">{percent(fiveStars, totalRatings)}</b> com 5 estrelas
          </span>
        </article>
        <article className="dash-kpi">
          <span className="dash-kpi-label">Pedidos</span>
          <div className="dash-kpi-main"><strong>{count(orders.summary.total_orders)}</strong></div>
          <span className="dash-kpi-foot">
            <b className="is-good">{percent(orders.summary.delivered, orders.summary.total_orders)}</b> entregues
          </span>
        </article>
        <article className="dash-kpi">
          <span className="dash-kpi-label">Tickets em aberto</span>
          <div className="dash-kpi-main"><strong className="is-accent">{count(orders.summary.open_tickets)}</strong></div>
          <span className="dash-kpi-foot">
            <b className="is-bad">{percent(lowRatings, totalRatings)}</b> das notas são 1 ou 2
          </span>
        </article>
      </section>

      <section className="dash-grid">
        <article className="panel span-8">
          <header className="panel-head">
            <div>
              <h2>Avaliações por dia</h2>
              <p>Diário (cinza) e média móvel de 7 dias (laranja)</p>
            </div>
            {peakDay.count > 0 && (
              <span className="panel-chip">Pico: {count(peakDay.count)} em {formatDay(peakDay.date)}</span>
            )}
          </header>
          <div className="chart-box" role="group" aria-label="Quantidade e categorias de avaliações por dia">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={daily}
                accessibilityLayer
                margin={{ top: 6, right: 6, bottom: 0, left: -12 }}
                onMouseMove={(state) => {
                  const index = chartDataIndex(state.activeTooltipIndex);
                  setActiveDayIndex(
                    state.isTooltipActive ? index : null
                  );
                }}
                onMouseLeave={() => setActiveDayIndex(null)}
                onClick={(state) => {
                  setActiveDayIndex(chartDataIndex(state.activeTooltipIndex));
                }}
              >
                <defs>
                  <linearGradient id="dayFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ORANGE} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={TICK}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                  tickFormatter={(value: string) => formatMonth(value.slice(0, 7))}
                />
                <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={count} />
                <Tooltip
                  content={(props) => <DailyTooltip {...props} />}
                  cursor={{ fill: '#fff4eb', opacity: 0.6 }}
                />
                <Bar dataKey="count" fill="#e2e8f0" maxBarSize={8}>
                  {daily.map((day, index) => (
                    <Cell
                      key={day.date}
                      fill={index === activeDayIndex ? ORANGE : '#e2e8f0'}
                      fillOpacity={activeDayIndex === null || index === activeDayIndex ? 1 : 0.22}
                    />
                  ))}
                </Bar>
                <Area
                  type="monotone"
                  dataKey="average"
                  stroke={ORANGE}
                  strokeWidth={2}
                  strokeOpacity={activeDayIndex === null ? 1 : 0.3}
                  fill="url(#dayFill)"
                  fillOpacity={activeDayIndex === null ? 1 : 0.25}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel span-4">
          <header className="panel-head">
            <div>
              <h2>Distribuição das notas</h2>
              <p>{count(totalRatings)} avaliações</p>
            </div>
          </header>
          <ul className="rating-list">
            {ratings.map((item) => (
              <li key={item.rating}>
                <span className="rating-label">{item.rating} ★</span>
                <div className="rating-track" aria-hidden="true">
                  <i
                    style={{
                      width: `${totalRatings ? (item.count / totalRatings) * 100 : 0}%`,
                      background: RATING_COLORS[item.rating] ?? ORANGE,
                    }}
                  />
                </div>
                <span className="rating-share">{percent(item.count, totalRatings)}</span>
                <span className="rating-count">{count(item.count)}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel span-8">
          <header className="panel-head">
            <div>
              <h2>Volume e nota média por mês</h2>
              <p>Barras: avaliações · Linha: nota média</p>
            </div>
          </header>
          <div className="chart-box" role="group" aria-label="Avaliações e nota média por mês">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={metrics.by_month}
                accessibilityLayer
                margin={{ top: 6, right: 0, bottom: 0, left: -12 }}
                onMouseMove={(state) => {
                  const index = chartDataIndex(state.activeTooltipIndex);
                  setActiveMonthIndex(
                    state.isTooltipActive ? index : null
                  );
                }}
                onMouseLeave={() => setActiveMonthIndex(null)}
                onClick={(state) => {
                  setActiveMonthIndex(chartDataIndex(state.activeTooltipIndex));
                }}
              >
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={false} tickFormatter={formatMonth} minTickGap={16} />
                <YAxis yAxisId="count" tick={TICK} tickLine={false} axisLine={false} tickFormatter={count} />
                <YAxis yAxisId="rating" orientation="right" domain={[1, 5]} tick={TICK} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(value) => formatMonth(String(value))}
                  formatter={(value, name) =>
                    name === 'average_rating'
                      ? [Number(value).toLocaleString('pt-BR'), 'Nota média']
                      : [count(Number(value ?? 0)), 'Avaliações']
                  }
                  cursor={{ fill: '#fff4eb', opacity: 0.6 }}
                />
                <Bar yAxisId="count" dataKey="count" fill={ORANGE} radius={[4, 4, 0, 0]} maxBarSize={26}>
                  {metrics.by_month.map((month, index) => (
                    <Cell
                      key={month.month}
                      fill={ORANGE}
                      fillOpacity={activeMonthIndex === null || index === activeMonthIndex ? 1 : 0.18}
                    />
                  ))}
                </Bar>
                <Line
                  yAxisId="rating"
                  type="monotone"
                  dataKey="average_rating"
                  stroke={INK}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: INK, stroke: '#fff', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel span-4">
          <header className="panel-head">
            <div>
              <h2>Tickets</h2>
              <p>Abertos x fechados</p>
            </div>
          </header>
          <div className="donut">
            <div className="donut-chart" role="img" aria-label="Tickets abertos e fechados">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={orders.by_ticket_status}
                    dataKey="count"
                    nameKey="status"
                    innerRadius="72%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={orders.summary.open_tickets ? 2 : 0}
                    stroke="none"
                  >
                    {orders.by_ticket_status.map((item) => (
                      <Cell key={item.status} fill={item.status === 'open' ? ORANGE : '#e2e8f0'} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center">
                <strong>{percent(orders.summary.closed_tickets, orders.summary.total_orders)}</strong>
                <span>resolvidos</span>
              </div>
            </div>
            <ul className="legend">
              <li><i style={{ background: ORANGE }} />Abertos <b>{count(orders.summary.open_tickets)}</b></li>
              <li><i style={{ background: '#cbd5e1' }} />Fechados <b>{count(orders.summary.closed_tickets)}</b></li>
            </ul>
          </div>
        </article>

        <article className="panel span-4">
          <header className="panel-head">
            <div>
              <h2>Top categorias</h2>
              <p>Avaliações e nota média por categoria</p>
            </div>
          </header>
          {metrics.by_category.length ? (
            <BarList
              rows={metrics.by_category.map((item) => ({
                key: item.category,
                label: humanize(item.category),
                value: item.count,
                meta: item.average_rating ? `★ ${item.average_rating.toLocaleString('pt-BR')}` : undefined,
              }))}
            />
          ) : (
            <p className="panel-empty">Sem categorias no dataset processado.</p>
          )}
        </article>

        <article className="panel span-4">
          <header className="panel-head">
            <div>
              <h2>Pedidos por status</h2>
              <p>Situação logística atual</p>
            </div>
          </header>
          <BarList
            rows={orderStatus.map((item) => ({
              key: item.status,
              label: STATUS_LABELS[item.status] ?? item.status,
              value: item.count,
              color: STATUS_COLORS[item.status],
              meta: percent(item.count, orders.summary.total_orders),
            }))}
          />
        </article>

        <article className="panel span-4 md-full">
          <header className="panel-head">
            <div>
              <h2>Cidades com mais pedidos</h2>
              <p>Top 10 por volume</p>
            </div>
          </header>
          <BarList
            rows={orders.by_city.map((item) => ({
              key: `${item.city}-${item.state}`,
              label: `${formatCity(item.city)}, ${item.state}`,
              value: item.orders,
              color: INK,
              meta: `${count(item.customers)} clientes`,
            }))}
          />
        </article>
      </section>
    </main>
  );
}
