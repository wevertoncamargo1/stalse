'use client';

import { useEffect, useState } from 'react';
import { formatCity } from '../format-city';
import { getOperatorHeaders } from '../operator';
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

type Metrics = {
  generated_at: string;
  record_type: 'reviews' | 'records';
  summary: {
    total_records: number;
    average_rating: number | null;
  };
  by_day: Array<{ date: string; count: number }>;
  by_month: Array<{ month: string; count: number; average_rating: number | null }>;
  by_category: Array<{ category: string; count: number }>;
  by_rating: Array<{ rating: string; count: number }>;
  by_status: Array<{ status: string; count: number }>;
  by_priority: Array<{ priority: string; count: number }>;
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
const TICKET_STATUS_LABELS: Record<string, string> = {
  open: 'Abertos',
  closed: 'Fechados',
};
const TICKET_STATUS_COLORS: Record<string, string> = {
  open: '#22c55e',
  closed: '#60a5fa',
};

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch(`${API_BASE}/metrics`, {
          headers: getOperatorHeaders(),
        });
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? 'Métricas ainda não geradas. Coloque o arquivo de reviews do Olist em data/raw/olist_order_reviews_dataset.csv e execute o ETL.'
              : 'Não foi possível carregar as métricas.'
          );
        }
        const data = await response.json();
        setMetrics(data);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Não foi possível carregar as métricas.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <main className="page-shell" aria-busy="true" aria-label="Carregando métricas">
        <div className="skeleton-line skeleton-eyebrow" />
        <div className="skeleton-line skeleton-heading" />
        <section className="stats-grid" aria-hidden="true">
          {[0, 1].map((item) => (
            <div className="stat-card skeleton-metric" key={item}>
              <div className="skeleton-line skeleton-label" />
              <div className="skeleton-line skeleton-value" />
            </div>
          ))}
        </section>
        <section className="panel-grid skeleton-metrics-panels" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => (
            <div className="panel skeleton-panel" key={item}>
              <div className="skeleton-line skeleton-panel-title" />
              {[0, 1, 2, 3].map((line) => (
                <div className="skeleton-line skeleton-panel-line" key={line} />
              ))}
            </div>
          ))}
        </section>
      </main>
    );
  }
  if (error || !metrics) {
    return <main className="page-shell"><p>{error ?? 'Não foi possível carregar as métricas.'}</p></main>;
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Reviews do Olist</p>
          <h1>Avaliações de clientes</h1>
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <span>{metrics.record_type === 'reviews' ? 'Total de avaliações' : 'Total de registros'}</span>
          <strong>{metrics.summary.total_records.toLocaleString('pt-BR')}</strong>
        </div>
        {metrics.summary.average_rating !== null && (
          <div className="stat-card">
            <span>Nota média</span>
            <strong>{metrics.summary.average_rating.toLocaleString('pt-BR')}</strong>
          </div>
        )}
        {metrics.by_status.map((item) => (
          <div className="stat-card" key={item.status}>
            <span>Status: {item.status}</span>
            <strong>{item.count.toLocaleString('pt-BR')}</strong>
          </div>
        ))}
        {metrics.by_priority.map((item) => (
          <div className="stat-card" key={item.priority}>
            <span>Prioridade: {item.priority}</span>
            <strong>{item.count.toLocaleString('pt-BR')}</strong>
          </div>
        ))}
      </section>

      <header className="section-heading">
        <div>
          <p className="eyebrow">Pedidos Olist</p>
          <h2>Visão da operação</h2>
        </div>
      </header>
      <section className="stats-grid">
        <div className="stat-card">
          <span>Total de pedidos</span>
          <strong>{metrics.orders.summary.total_orders.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="stat-card">
          <span>Entregues</span>
          <strong>{metrics.orders.summary.delivered.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="stat-card">
          <span>Cancelados</span>
          <strong>{metrics.orders.summary.canceled.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="stat-card">
          <span>Indisponíveis</span>
          <strong>{metrics.orders.summary.unavailable.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="stat-card">
          <span>Tickets abertos</span>
          <strong>{metrics.orders.summary.open_tickets.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="stat-card">
          <span>Tickets fechados</span>
          <strong>{metrics.orders.summary.closed_tickets.toLocaleString('pt-BR')}</strong>
        </div>
      </section>

      <section className="panel-grid">
        <div className="panel chart-panel">
          <h2>Tickets abertos e fechados</h2>
          <div className="chart-container" role="img" aria-label="Distribuição de tickets abertos e fechados">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metrics.orders.by_ticket_status}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="48%"
                  innerRadius={65}
                  outerRadius={105}
                  paddingAngle={4}
                  stroke="none"
                >
                  {metrics.orders.by_ticket_status.map((item) => (
                    <Cell key={item.status} fill={TICKET_STATUS_COLORS[item.status]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [
                    Number(value ?? 0).toLocaleString('pt-BR'),
                    TICKET_STATUS_LABELS[String(name)] ?? String(name),
                  ]}
                  contentStyle={{
                    background: '#111827',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    borderRadius: 10,
                  }}
                />
                <Legend formatter={(value) => TICKET_STATUS_LABELS[value] ?? value} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel">
          <h2>Avaliações por mês</h2>
          <ul>
            {metrics.by_month.map((item) => (
              <li key={item.month}>
                <span>
                  {new Date(`${item.month}-01T12:00:00`).toLocaleDateString('pt-BR', {
                    month: 'long',
                    year: 'numeric',
                  })}
                  <small className="metric-secondary">
                    {item.count.toLocaleString('pt-BR')} avaliações
                  </small>
                </span>
                <strong>
                  {item.average_rating === null
                    ? 'Média indisponível'
                    : `Média ${item.average_rating.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} / 5`}
                </strong>
              </li>
            ))}
          </ul>
        </div>

        {metrics.by_category.length > 0 && (
          <div className="panel">
            <h2>Por categoria</h2>
            <ul>
              {metrics.by_category.map((item) => (
                <li key={item.category}><span>{item.category}</span><strong>{item.count.toLocaleString('pt-BR')}</strong></li>
              ))}
            </ul>
          </div>
        )}

        {metrics.by_rating.length > 0 && (
          <div className="panel">
            <h2>Distribuição das notas</h2>
            <ul>
              {metrics.by_rating.map((item) => (
                <li key={item.rating}><span>{item.rating} estrela(s)</span><strong>{item.count.toLocaleString('pt-BR')}</strong></li>
              ))}
            </ul>
          </div>
        )}

        <div className="panel">
          <h2>Pedidos por status</h2>
          <ul>
            {metrics.orders.by_status.map((item) => (
              <li key={item.status}>
                <span>{STATUS_LABELS[item.status] ?? item.status}</span>
                <strong>{item.count.toLocaleString('pt-BR')}</strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Cidades com mais pedidos</h2>
          <ul>
            {metrics.orders.by_city.map((item) => (
              <li key={`${item.city}-${item.state}`}>
                <span>{formatCity(item.city)}, {item.state}<small className="metric-secondary">{item.customers.toLocaleString('pt-BR')} clientes</small></span>
                <strong>{item.orders.toLocaleString('pt-BR')}</strong>
              </li>
            ))}
          </ul>
        </div>

      </section>
    </main>
  );
}
