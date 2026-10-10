'use client';

import Link from 'next/link';
import { DragEvent, useEffect, useState } from 'react';
import { formatCity } from '../format-city';
import { getOperatorHeaders, useOperatorName } from '../operator';
import Snackbar from '../snackbar';

const STATUSES = [
  'created',
  'processing',
  'approved',
  'unavailable',
  'invoiced',
  'shipped',
  'canceled',
  'delivered',
] as const;

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

function formatCurrency(value: number | null): string {
  if (value === null) return 'Valor indisponível';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function sortByPriority(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((left, right) => (
    PRIORITY_RANK[left.priority ?? 'low'] - PRIORITY_RANK[right.priority ?? 'low']
  ));
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
  const ticketRows = STATUSES.flatMap((status) =>
    columns[status].tickets.map((ticket) => ({ status, ticket }))
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ per_column: String(PER_COLUMN) });
      if (query) params.set('q', query);
      if (ticketStatusFilter !== 'all') params.set('ticket_status', ticketStatusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);

      try {
        const response = await fetch(`${API_BASE}/tickets/board?${params}`, {
          signal: controller.signal,
          headers: getOperatorHeaders(),
        });
        if (!response.ok) {
          throw new Error('Não foi possível carregar os pedidos. Verifique se a API está ativa.');
        }
        const data: BoardResponse = await response.json();
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
        </div>
        <Link href="/" className="secondary-button">
          Voltar ao início
        </Link>
      </header>

      <div className="toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar pedido, cliente, cidade (com ou sem acento) ou categoria..."
          aria-label="Buscar pedidos"
        />
        <div className="view-switch" role="group" aria-label="Visualização dos pedidos">
          <button
            type="button"
            className={view === 'kanban' ? 'is-active' : ''}
            aria-pressed={view === 'kanban'}
            onClick={() => setView('kanban')}
          >
            Kanban
          </button>
          <button
            type="button"
            className={view === 'list' ? 'is-active' : ''}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            Lista
          </button>
        </div>
        {loading && <span className="searching-indicator" role="status">Buscando…</span>}
      </div>
      <div className="ticket-filters" aria-label="Filtros dos pedidos">
        <label>
          Status do ticket
          <select
            aria-label="Filtrar por status do ticket"
            onChange={(event) => setTicketStatusFilter(event.target.value as typeof ticketStatusFilter)}
            value={ticketStatusFilter}
          >
            <option value="all">Todos os status</option>
            <option value="open">Abertos</option>
            <option value="closed">Fechados</option>
          </select>
        </label>
        <label>
          Prioridade
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
        </label>
      </div>
      <p className="board-help">
        {view === 'kanban'
          ? 'Arraste um card para outra coluna para atualizar o status do pedido. Clique em qualquer parte do card para ver os detalhes.'
          : 'Clique em um pedido para abrir os detalhes. Os pedidos são exibidos por status e prioridade.'}
      </p>
      {error && <p role="alert">{error}</p>}

      {view === 'kanban' && (
      <section className="kanban-board" aria-label="Pedidos por status" aria-busy={loading}>
        {STATUSES.map((status) => {
          const column = columns[status];
          return (
            <section
              className={`kanban-column${dropTarget === status ? ' is-drop-target' : ''}`}
              key={status}
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
                <h2>{STATUS_LABELS[status]}</h2>
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
                    className={`kanban-card${dragging === ticket.id ? ' is-dragging' : ''}${recentlyMoved.includes(ticket.id) ? ' is-moved' : ''}`}
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
                      <strong>#{ticket.order_id.slice(0, 8)}</strong>
                      <span className={`badge status-${ticket.status ?? 'open'}`}>
                        {ticket.status === 'closed' ? 'Fechado' : 'Aberto'}
                      </span>
                      {ticket.priority ? (
                        <span className={`badge priority-${ticket.priority}`}>
                          {ticket.priority === 'high' ? 'Alta' : ticket.priority === 'medium' ? 'Média' : 'Baixa'}
                        </span>
                      ) : <span className="badge">Sem prioridade</span>}
                    </div>
                    <p className="kanban-customer">
                      {ticket.customer_city && ticket.customer_state
                        ? `${formatCity(ticket.customer_city)}, ${ticket.customer_state}`
                        : `Cliente ${ticket.customer_unique_id?.slice(0, 8) ?? ticket.customer_id.slice(0, 8)}`}
                    </p>
                    <p className="kanban-category">
                      {ticket.product_categories?.replaceAll(',', ', ').replaceAll('_', ' ') ?? 'Categoria indisponível'}
                    </p>
                    <div className="kanban-card-meta">
                      <span>{ORDER_STATUS_LABELS[ticket.order_status] ?? ticket.order_status}</span>
                      <span>{formatDate(ticket.order_purchase_timestamp)}</span>
                    </div>
                    <div className="kanban-card-meta">
                      <span>{ticket.item_count ?? 0} item(ns)</span>
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
            <span>Pedido</span>
            <span>Cliente</span>
            <span>Status</span>
            <span>Prioridade</span>
            <span>Data da compra</span>
            <span>Valor</span>
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
              <span data-label="Pedido">#{ticket.order_id.slice(0, 8)}</span>
              <span data-label="Cliente">
                {ticket.customer_city && ticket.customer_state
                  ? `${formatCity(ticket.customer_city)}, ${ticket.customer_state}`
                  : `Cliente ${ticket.customer_unique_id?.slice(0, 8) ?? ticket.customer_id.slice(0, 8)}`}
              </span>
              <span data-label="Status">{ORDER_STATUS_LABELS[ticket.order_status] ?? ticket.order_status}</span>
              <span data-label="Prioridade">
                {ticket.priority ? (
                  <span className={`badge priority-${ticket.priority}`}>
                    {ticket.priority === 'high' ? 'Alta' : ticket.priority === 'medium' ? 'Média' : 'Baixa'}
                  </span>
                ) : 'Sem prioridade'}
              </span>
              <span data-label="Data da compra">{formatDate(ticket.order_purchase_timestamp)}</span>
              <strong data-label="Valor">{formatCurrency(ticket.payment_total)}</strong>
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
