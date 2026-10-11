'use client';

import Link from 'next/link';
import { DragEvent, useEffect, useRef, useState } from 'react';
import { formatCity } from '../format-city';
import { getOperatorHeaders, useOperatorName } from '../operator';
import Snackbar from '../snackbar';
import { useCountUp } from '../count-up';

const STATUSES = [
  'created',
  'approved',
  'processing',
  'invoiced',
  'shipped',
  'delivered',
  'canceled',
  'unavailable',
] as const;
const FLOW_STEPS = ['created', 'approved', 'processing', 'invoiced', 'shipped', 'delivered'] as const;
const EXIT_STEPS = ['canceled', 'unavailable'] as const;
const KEY_STEPS: readonly string[] = ['shipped', 'delivered'];
const STEP_HINTS: Record<string, string> = {
  created: 'Pedido recebido',
  approved: 'Pagamento ok',
  processing: 'Separação',
  invoiced: 'Nota emitida',
  shipped: 'Em trânsito',
  delivered: 'Na mão do cliente',
  canceled: 'Cancelado pelo cliente ou loja',
  unavailable: 'Sem estoque',
};

type Status = (typeof STATUSES)[number];

type Ticket = {
  id: number;
  order_id: string;
  customer_id: string;
  customer_unique_id: string | null;
  customer_city: string | null;
  customer_state: string | null;
  order_status: string;
  status: 'open' | 'closed' | null;
  order_purchase_timestamp: string;
  product_categories: string | null;
  item_count: number | null;
  items_total: number | null;
  freight_total: number | null;
  payment_total: number | null;
  payment_types: string | null;
  priority: 'low' | 'medium' | 'high' | null;
};

type Column = {
  tickets: Ticket[];
  total: number;
};

type BoardResponse = {
  columns: Record<Status, Column>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const PER_COLUMN = 20;
const BOARD_CACHE_PREFIX = 'stalse_board:';
const boardCache = new Map<string, Record<Status, Column>>();

function readBoardCache(key: string): Record<Status, Column> | null {
  const inMemory = boardCache.get(key);
  if (inMemory) return inMemory;
  try {
    const stored = window.sessionStorage.getItem(BOARD_CACHE_PREFIX + key);
    return stored ? (JSON.parse(stored) as Record<Status, Column>) : null;
  } catch {
    return null;
  }
}

function writeBoardCache(key: string, value: Record<Status, Column>) {
  boardCache.set(key, value);
  try {
    window.sessionStorage.setItem(BOARD_CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or unavailable: memory cache is enough
  }
}
const PRIORITY_RANK: Record<'low' | 'medium' | 'high', number> = {
  high: 0,
  medium: 1,
  low: 2,
};
const STATUS_LABELS: Record<Status, string> = {
  created: 'Criados',
  processing: 'Em processamento',
  approved: 'Aprovados',
  unavailable: 'Indisponíveis',
  invoiced: 'Faturado',
  shipped: 'Enviados',
  canceled: 'Cancelados',
  delivered: 'Entregues',
};
const STATUS_COLORS: Record<Status, string> = {
  created: '#64748b',
  processing: '#f59e0b',
  approved: '#0ea5e9',
  unavailable: '#a855f7',
  invoiced: '#6366f1',
  shipped: '#f27218',
  canceled: '#dc2626',
  delivered: '#16a34a',
};
const ORDER_STATUS_LABELS: Record<string, string> = {
  approved: 'Aprovado',
  canceled: 'Cancelado',
  created: 'Criado',
  delivered: 'Entregue',
  invoiced: 'Faturado',
  processing: 'Em processamento',
  shipped: 'Enviado',
  unavailable: 'Indisponível',
};

function formatDate(value: string): string {
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

const CHANNEL_LABELS: Record<string, string> = {
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  boleto: 'Boleto',
  voucher: 'Vale-compra',
  not_defined: 'Não informado',
};

function formatChannel(value: string | null): string {
  if (!value) return 'Não informado';
  return value.split(',').map((item) => CHANNEL_LABELS[item.trim()] ?? item.trim()).join(' + ');
}

function percent(part: number, total: number): string {
  if (!total) return '0%';
  return `${((part / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function formatCurrency(value: number | null): string {
  if (value === null) return 'Valor indisponível';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function sortByPriority(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((left, right) => (
    PRIORITY_RANK[left.priority ?? 'low'] - PRIORITY_RANK[right.priority ?? 'low']
  ));
}

function StepValue({ value, ready }: { value: number; ready: boolean }) {
  const animated = useCountUp(ready ? value : 0);
  return <>{ready ? animated.toLocaleString('pt-BR') : '—'}</>;
}

function Guide({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <div className="guide">
      <span className="guide-step">{step}</span>
      <strong>{title}</strong>
      <span className="guide-text">{children}</span>
    </div>
  );
}

export default function TicketsPage() {
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [columns, setColumns] = useState<Record<Status, Column>>({
    created: { tickets: [], total: 0 },
    processing: { tickets: [], total: 0 },
    approved: { tickets: [], total: 0 },
    unavailable: { tickets: [], total: 0 },
    invoiced: { tickets: [], total: 0 },
    shipped: { tickets: [], total: 0 },
    canceled: { tickets: [], total: 0 },
    delivered: { tickets: [], total: 0 },
  });
  const [query, setQuery] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'low' | 'medium' | 'high' | 'none'>('all');
  const operator = useOperatorName();
  const searchRef = useRef<HTMLInputElement>(null);
  const [averageRating, setAverageRating] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/metrics`, { signal: controller.signal, headers: getOperatorHeaders() })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setAverageRating(data?.summary?.average_rating ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const focusColumn = (status: Status) => {
    setView('kanban');
    window.setTimeout(() => {
      document.getElementById(`col-${status}`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
      document.getElementById('board')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<Status | null>(null);
  const [busyTickets, setBusyTickets] = useState<number[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recentlyMoved, setRecentlyMoved] = useState<number[]>([]);
  const [loadingMoreAll, setLoadingMoreAll] = useState(false);
  const [notice, setNotice] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const hasLoadedTickets = STATUSES.some((status) => columns[status].tickets.length > 0);
  const hasMoreTickets = STATUSES.some(
    (status) => columns[status].tickets.length < columns[status].total
  );
  const totalTickets = STATUSES.reduce((sum, status) => sum + columns[status].total, 0);
  const closedTickets = columns.delivered.total + columns.canceled.total;
  const openTickets = totalTickets - closedTickets;
  const quickFilters = [
    {
      label: 'Todos',
      active: ticketStatusFilter === 'all' && priorityFilter === 'all',
      apply: () => { setTicketStatusFilter('all'); setPriorityFilter('all'); },
    },
    {
      label: 'Alta prioridade',
      active: priorityFilter === 'high',
      apply: () => setPriorityFilter(priorityFilter === 'high' ? 'all' : 'high'),
    },
    {
      label: 'Abertos',
      active: ticketStatusFilter === 'open',
      apply: () => setTicketStatusFilter(ticketStatusFilter === 'open' ? 'all' : 'open'),
    },
    {
      label: 'Fechados',
      active: ticketStatusFilter === 'closed',
      apply: () => setTicketStatusFilter(ticketStatusFilter === 'closed' ? 'all' : 'closed'),
    },
  ];
  const ticketRows = STATUSES.flatMap((status) =>
    columns[status].tickets.map((ticket) => ({ status, ticket }))
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName ?? '';
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ per_column: String(PER_COLUMN) });
      if (query) params.set('q', query);
      if (ticketStatusFilter !== 'all') params.set('ticket_status', ticketStatusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      const cacheKey = params.toString();
      const cached = readBoardCache(cacheKey);
      if (cached) setColumns(cached);

      try {
        const response = await fetch(`${API_BASE}/tickets/board?${params}`, {
          signal: controller.signal,
          headers: getOperatorHeaders(),
        });
        if (!response.ok) {
          throw new Error('Não foi possível carregar os pedidos. Verifique se a API está ativa.');
        }
        const data: BoardResponse = await response.json();
        writeBoardCache(cacheKey, data.columns);
        setColumns(data.columns);
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : 'Não foi possível carregar os pedidos.'
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? 350 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, ticketStatusFilter, priorityFilter, refreshKey]);

  const exportCsv = () => {
    const header = ['Pedido', 'Cliente', 'Cidade', 'UF', 'Status do pedido', 'Status do ticket',
      'Prioridade', 'Data da compra', 'Itens', 'Valor'];
    const escape = (value: string | number | null) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const lines = ticketRows.map(({ ticket }) => [
      ticket.order_id, ticket.customer_unique_id ?? ticket.customer_id,
      ticket.customer_city ? formatCity(ticket.customer_city) : '', ticket.customer_state,
      ORDER_STATUS_LABELS[ticket.order_status] ?? ticket.order_status,
      ticket.status === 'closed' ? 'Fechado' : 'Aberto', ticket.priority ?? '',
      ticket.order_purchase_timestamp, ticket.item_count ?? 0, ticket.payment_total ?? '',
    ].map(escape).join(';'));
    const blob = new Blob(['\ufeff' + [header.map(escape).join(';'), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pedidos-stalse.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadMore = async (status: Status) => {
    const offset = columns[status].tickets.length;
    const params = new URLSearchParams({ limit: String(PER_COLUMN), offset: String(offset) });
    params.set('status', status);
    if (query) params.set('q', query);
    if (ticketStatusFilter !== 'all') params.set('ticket_status', ticketStatusFilter);
    if (priorityFilter !== 'all' && priorityFilter !== 'none') {
      params.set('priority', priorityFilter);
    } else if (priorityFilter === 'none') {
      params.set('priority', 'none');
    }
    try {
      const response = await fetch(`${API_BASE}/tickets?${params}`, {
        headers: getOperatorHeaders(),
      });
      if (!response.ok) throw new Error('Não foi possível carregar mais pedidos.');
      const data: { tickets: Ticket[] } = await response.json();
      setColumns((current) => ({
        ...current,
        [status]: {
          ...current[status],
          tickets: sortByPriority([
            ...current[status].tickets,
            ...data.tickets.filter(
              (ticket) => !current[status].tickets.some((existing) => existing.id === ticket.id)
            ),
          ]),
        },
      }));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Erro ao carregar pedidos.');
    }
  };

  const loadMoreAll = async () => {
    if (loadingMoreAll) return;
    setLoadingMoreAll(true);
    try {
      await Promise.all(
        STATUSES.filter((status) => columns[status].tickets.length < columns[status].total)
          .map((status) => loadMore(status))
      );
    } finally {
      setLoadingMoreAll(false);
    }
  };

  const moveTicket = async (ticket: Ticket, nextStatus: Status) => {
    if (!operator.trim()) {
      setNotice({ message: 'Informe o operador antes de alterar um pedido.', variant: 'error' });
      return;
    }
    const previousStatus = ticket.order_status as Status;
    if (previousStatus === nextStatus || busyTickets.includes(ticket.id)) return;
    const updatedTicket: Ticket = {
      ...ticket,
      order_status: nextStatus,
      status: nextStatus === 'delivered' || nextStatus === 'canceled' ? 'closed' : 'open',
    };
    setBusyTickets((current) => [...current, ticket.id]);
    setError(null);
    setNotice(null);
    setColumns((current) => ({
      ...current,
      [previousStatus]: {
        ...current[previousStatus],
        tickets: current[previousStatus].tickets.filter((item) => item.id !== ticket.id),
        total: Math.max(0, current[previousStatus].total - 1),
      },
      [nextStatus]: {
        ...current[nextStatus],
        tickets: sortByPriority([
          updatedTicket,
          ...current[nextStatus].tickets.filter((item) => item.id !== ticket.id),
        ]).slice(0, Math.max(PER_COLUMN, current[nextStatus].tickets.length)),
        total: current[nextStatus].total + 1,
      },
    }));

    try {
      const response = await fetch(`${API_BASE}/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getOperatorHeaders() },
        body: JSON.stringify({ order_status: nextStatus }),
      });
      if (!response.ok) throw new Error('Não foi possível atualizar o status do pedido.');
      const saved: Ticket = await response.json();
      setColumns((current) => ({
        ...current,
        [nextStatus]: {
          ...current[nextStatus],
          tickets: sortByPriority(current[nextStatus].tickets.map((item) =>
            item.id === saved.id ? saved : item
          )),
        },
      }));
      setRecentlyMoved((current) => [...current.filter((id) => id !== ticket.id), ticket.id]);
      setNotice({
        message: `Pedido movido para ${STATUS_LABELS[nextStatus]}.`,
        variant: 'success',
      });
      window.setTimeout(() => {
        setRecentlyMoved((current) => current.filter((id) => id !== ticket.id));
      }, 1800);
    } catch (updateError) {
      setNotice({
        message: updateError instanceof Error
          ? updateError.message
          : 'Não foi possível atualizar o status do pedido.',
        variant: 'error',
      });
      setRefreshKey((current) => current + 1);
    } finally {
      setBusyTickets((current) => current.filter((id) => id !== ticket.id));
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>, status: Status) => {
    event.preventDefault();
    const ticketId = Number(event.dataTransfer.getData('text/plain'));
    const ticket = STATUSES.flatMap((column) => columns[column].tickets)
      .find((item) => item.id === ticketId);
    setDragging(null);
    setDropTarget(null);
    if (ticket) void moveTicket(ticket, status);
  };

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Pedidos da base Olist</p>
          <h1>Quadro de atendimento</h1>
          <p className="page-subtitle">
            {view === 'kanban'
              ? 'Clique numa etapa para ir direto à coluna. Arraste os cards para avançar o pedido.'
              : 'Clique em um pedido para abrir os detalhes.'}
          </p>
        </div>
        <div className="page-actions">
          <div className="view-switch" role="group" aria-label="Visualização dos pedidos">
            <button
              type="button"
              className={view === 'kanban' ? 'is-active' : ''}
              aria-pressed={view === 'kanban'}
              onClick={() => setView('kanban')}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h3v12H2zM6.5 2h3v8h-3zM11 2h3v10h-3z" /></svg>
              Kanban
            </button>
            <button
              type="button"
              className={view === 'list' ? 'is-active' : ''}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12v2H2zM2 7h12v2H2zM2 11h12v2H2z" /></svg>
              Lista
            </button>
          </div>
          <button type="button" className="ghost-button" onClick={exportCsv} disabled={!ticketRows.length}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 1h2v7.6l2.3-2.3 1.4 1.4L8 12.4 3.3 7.7l1.4-1.4L7 8.6zM2 13h12v2H2z" /></svg>
            Exportar CSV
          </button>
        </div>
      </header>

      <section className="journey-banner" aria-label="Jornada do pedido">
        <div className="journey-head">
          <span className="pipeline-tag">
            <i aria-hidden="true" />
            Ao vivo · <StepValue value={totalTickets} ready={hasLoadedTickets} /> pedidos no radar
          </span>
          <h2>
            Do clique à entrega, <em>nenhum pedido fica para trás.</em>
          </h2>
          <p>Cada etapa da jornada em tempo real. Clique numa etapa para ir direto aos pedidos dela.</p>
        </div>

        <ol className="journey-steps">
          <span className="journey-track" aria-hidden="true"><i /></span>
          {FLOW_STEPS.map((status, index) => {
            const value = columns[status].total;
            const isKey = KEY_STEPS.includes(status);
            return (
              <li
                key={status}
                className={isKey ? 'is-key' : undefined}
                style={{ '--col': STATUS_COLORS[status], '--i': index } as React.CSSProperties}
              >
                <button type="button" onClick={() => focusColumn(status)} aria-label={`Ver ${STATUS_LABELS[status]}`}>
                  <span className="step-node" aria-hidden="true">
                    {status === 'delivered' ? (
                      <svg viewBox="0 0 16 16"><path d="M6.2 11.6 2.6 8l1.4-1.4 2.2 2.2 5.8-5.8 1.4 1.4z" /></svg>
                    ) : String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="step-name">{STATUS_LABELS[status]}</span>
                  <strong className="step-value"><StepValue value={value} ready={hasLoadedTickets} /></strong>
                  <span className="step-hint">{STEP_HINTS[status]}</span>
                  <span className="step-bar" aria-hidden="true">
                    <i style={{ width: `${totalTickets ? Math.max(3, (value / totalTickets) * 100) : 0}%` }} />
                  </span>
                  {isKey && <span className="step-flag">{status === 'delivered' ? 'Meta' : 'Reta final'}</span>}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="journey-foot">
          <div className="pipeline-exits">
            <span>Saídas do fluxo</span>
            {EXIT_STEPS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => focusColumn(status)}
                style={{ '--col': STATUS_COLORS[status] } as React.CSSProperties}
              >
                <i aria-hidden="true" />
                {STATUS_LABELS[status]}
                <b>{columns[status].total.toLocaleString('pt-BR')}</b>
                <small>{percent(columns[status].total, totalTickets)}</small>
              </button>
            ))}
          </div>
          <div className="journey-proof">
            <div><strong>{totalTickets ? percent(columns.delivered.total, totalTickets) : '—'}</strong><span>entregues</span></div>
            <div><strong>{averageRating ? `${averageRating.toLocaleString('pt-BR')}★` : '—'}</strong><span>nota dos clientes</span></div>
            <div><strong className="is-hot"><StepValue value={openTickets} ready={hasLoadedTickets} /></strong><span>aguardando ação</span></div>
          </div>
        </div>
      </section>

      <Guide step="1" title="Encontre o pedido">
        Busque por código, cidade ou categoria. Os atalhos combinam status do ticket e prioridade.
      </Guide>
      <section className="filter-panel" aria-label="Busca e filtros">
        <div className="filter-row">
          <label className="search-field">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 2a5 5 0 0 1 3.9 8.1l3.5 3.5-1.4 1.4-3.5-3.5A5 5 0 1 1 7 2zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" /></svg>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar pedido, cliente, cidade ou categoria"
              aria-label="Buscar pedidos"
            />
            {loading ? <span className="searching-indicator" role="status">Buscando…</span> : <kbd>/</kbd>}
          </label>
          <select
            aria-label="Filtrar por status do ticket"
            onChange={(event) => setTicketStatusFilter(event.target.value as typeof ticketStatusFilter)}
            value={ticketStatusFilter}
          >
            <option value="all">Todos os tickets</option>
            <option value="open">Abertos</option>
            <option value="closed">Fechados</option>
          </select>
          <select
            aria-label="Filtrar por prioridade"
            onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}
            value={priorityFilter}
          >
            <option value="all">Todas as prioridades</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
            <option value="none">Sem prioridade</option>
          </select>
        </div>
        <div className="quick-filters" role="group" aria-label="Filtros rápidos">
          <span className="quick-filters-label">Atalhos</span>
          {quickFilters.map((filter) => (
            <button
              key={filter.label}
              type="button"
              className={filter.active ? 'is-active' : ''}
              aria-pressed={filter.active}
              onClick={filter.apply}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>
      {error && <p role="alert" className="inline-error">{error}</p>}

      <Guide step="2" title={view === 'kanban' ? 'Leia o quadro' : 'Leia a lista'}>
        <span className="legend-inline">
          {view === 'kanban' && <>Coluna = etapa do pedido.</>}
          <span><i className="edge edge-high" />Alta</span>
          <span><i className="edge edge-medium" />Média</span>
          <span><i className="edge edge-low" />Baixa</span>
          <span><i className="dot dot-open" />Aberto</span>
          <span><i className="dot dot-closed" />Fechado</span>
          {view === 'kanban' ? <>Arraste o card para mudar a etapa.</> : <>Clique na linha para abrir o pedido.</>}
        </span>
      </Guide>

      {view === 'kanban' && (
      <section className="kanban-board" id="board" aria-label="Pedidos por status" aria-busy={loading}>
        {STATUSES.map((status) => {
          const column = columns[status];
          return (
            <section
              className={`kanban-column${dropTarget === status ? ' is-drop-target' : ''}`}
              id={`col-${status}`}
              key={status}
              style={{ '--col': STATUS_COLORS[status] } as React.CSSProperties}
              onDragEnter={() => setDropTarget(status)}
              onDragOver={(event) => {
                event.preventDefault();
                setDropTarget(status);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDropTarget(null);
                }
              }}
              onDrop={(event) => handleDrop(event, status)}
            >
              <header className="kanban-column-header">
                <h2><i aria-hidden="true" />{STATUS_LABELS[status]}</h2>
                <span className="column-count">{column.total.toLocaleString('pt-BR')}</span>
              </header>
              <div className="kanban-cards">
                {loading && !hasLoadedTickets && (
                  <div className="skeleton-stack" aria-hidden="true">
                    {[0, 1, 2].map((item) => <div className="skeleton-card" key={item} />)}
                  </div>
                )}
                {column.tickets.map((ticket) => (
                  <Link
                    href={`/tickets/${ticket.id}`}
                    className={`kanban-card priority-edge-${ticket.priority ?? 'none'}${dragging === ticket.id ? ' is-dragging' : ''}${recentlyMoved.includes(ticket.id) ? ' is-moved' : ''}`}
                    key={ticket.id}
                    draggable={!busyTickets.includes(ticket.id) && Boolean(operator.trim())}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', String(ticket.id));
                      event.dataTransfer.effectAllowed = 'move';
                      setDragging(ticket.id);
                      setDropTarget(null);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    aria-label={`Pedido ${ticket.order_id}, abrir detalhes`}
                  >
                    <div className="kanban-card-top">
                      <strong className="order-code">#{ticket.order_id.slice(0, 8)}</strong>
                      {ticket.priority ? (
                        <span className={`badge priority-${ticket.priority}`}>
                          {ticket.priority === 'high' ? 'Alta' : ticket.priority === 'medium' ? 'Média' : 'Baixa'}
                        </span>
                      ) : <span className="badge priority-none">Sem prioridade</span>}
                    </div>
                    <p className="kanban-customer">
                      {ticket.customer_city && ticket.customer_state
                        ? `${formatCity(ticket.customer_city)}, ${ticket.customer_state}`
                        : `Cliente ${ticket.customer_unique_id?.slice(0, 8) ?? ticket.customer_id.slice(0, 8)}`}
                    </p>
                    <p className="kanban-category">
                      {ticket.product_categories?.replaceAll(',', ', ').replaceAll('_', ' ') ?? 'Categoria indisponível'}
                    </p>
                    <div className="kanban-card-footer">
                      <span className={`status-dot status-${ticket.status ?? 'open'}`}>
                        {ticket.status === 'closed' ? 'Fechado' : 'Aberto'}
                      </span>
                      <span>{formatDate(ticket.order_purchase_timestamp)}</span>
                      <span>{ticket.item_count ?? 0} {ticket.item_count === 1 ? 'item' : 'itens'}</span>
                      <strong>{formatCurrency(ticket.payment_total)}</strong>
                    </div>
                  </Link>
                ))}
                {!column.tickets.length && !loading && (
                  <p className="kanban-empty">Nenhum pedido nesta coluna.</p>
                )}
              </div>
              {column.tickets.length < column.total && (
                <button className="kanban-load-more" onClick={() => void loadMore(status)}>
                  Carregar mais
                </button>
              )}
            </section>
          );
        })}
      </section>
      )}

      {view === 'list' && (
        <section className="ticket-list" aria-label="Lista de pedidos" aria-busy={loading}>
          <div className="ticket-list-header" aria-hidden="true">
            <span>Criado em</span>
            <span>Cliente</span>
            <span>Canal</span>
            <span>Assunto</span>
            <span>Status</span>
            <span>Prioridade</span>
          </div>
          {loading && !hasLoadedTickets && (
            <div className="ticket-list-skeleton" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((item) => <div className="skeleton-row" key={item} />)}
            </div>
          )}
          {ticketRows.map(({ ticket }) => (
            <Link
              href={`/tickets/${ticket.id}`}
              className="ticket-list-row"
              key={ticket.id}
              aria-label={`Pedido ${ticket.order_id}, abrir detalhes`}
            >
              <span data-label="Criado em" className="cell-date">
                {formatDate(ticket.order_purchase_timestamp)}
                <small>#{ticket.order_id.slice(0, 8)}</small>
              </span>
              <span data-label="Cliente" className="cell-strong">
                {ticket.customer_city && ticket.customer_state
                  ? `${formatCity(ticket.customer_city)}, ${ticket.customer_state}`
                  : `Cliente ${ticket.customer_unique_id?.slice(0, 8) ?? ticket.customer_id.slice(0, 8)}`}
              </span>
              <span data-label="Canal">{formatChannel(ticket.payment_types)}</span>
              <span data-label="Assunto" className="cell-subject">
                {ticket.product_categories?.replaceAll(',', ', ').replaceAll('_', ' ') ?? 'Sem categoria'}
              </span>
              <span data-label="Status">
                <span className={`status-dot status-${ticket.status ?? 'open'}`}>
                  {ORDER_STATUS_LABELS[ticket.order_status] ?? ticket.order_status}
                </span>
              </span>
              <span data-label="Prioridade">
                {ticket.priority ? (
                  <span className={`badge priority-${ticket.priority}`}>
                    {ticket.priority === 'high' ? 'Alta' : ticket.priority === 'medium' ? 'Média' : 'Baixa'}
                  </span>
                ) : <span className="badge priority-none">Sem prioridade</span>}
              </span>
            </Link>
          ))}
          {!loading && !ticketRows.length && (
            <p className="ticket-list-empty">Nenhum pedido encontrado.</p>
          )}
          {hasMoreTickets && (
            <button
              className="ticket-list-load-more"
              onClick={() => void loadMoreAll()}
              disabled={loadingMoreAll}
            >
              {loadingMoreAll ? 'Carregando…' : 'Carregar mais pedidos'}
            </button>
          )}
        </section>
      )}
      {notice && (
        <Snackbar
          key={`${notice.variant}-${notice.message}`}
          message={notice.message}
          variant={notice.variant}
          onDismiss={() => setNotice(null)}
        />
      )}
    </main>
  );
}
