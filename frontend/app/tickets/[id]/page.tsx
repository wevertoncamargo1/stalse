'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatCity } from '../../format-city';
import Snackbar from '../../snackbar';

const ORDER_STATUSES = [
  'delivered',
  'shipped',
  'canceled',
  'unavailable',
  'invoiced',
  'processing',
  'created',
  'approved',
] as const;

type Ticket = {
  id: number;
  order_id: string;
  customer_id: string;
  customer_unique_id: string | null;
  customer_city: string | null;
  customer_state: string | null;
  order_status: string;
  order_purchase_timestamp: string;
  order_approved_at: string | null;
  order_delivered_carrier_date: string | null;
  order_delivered_customer_date: string | null;
  order_estimated_delivery_date: string | null;
  product_categories: string | null;
  item_count: number | null;
  items_total: number | null;
  freight_total: number | null;
  payment_total: number | null;
  payment_types: string | null;
  review_score: number | null;
  review_count: number | null;
  review_comments: string | null;
  priority: 'low' | 'medium' | 'high' | null;
  updated_at: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

function formatDate(value: string | null): string {
  if (!value) return 'Não informado';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

function formatCurrency(value: number | null): string {
  if (value === null) return 'Não informado';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

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

const PAYMENT_LABELS: Record<string, string> = {
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  boleto: 'Boleto',
  voucher: 'Vale-compra',
  not_defined: 'Não informado',
};

const CATEGORY_LABELS: Record<string, string> = {
  beleza_saude: 'Beleza e saúde',
  cama_mesa_banho: 'Cama, mesa e banho',
  esporte_lazer: 'Esporte e lazer',
  informatica_acessorios: 'Informática e acessórios',
  moveis_decoracao: 'Móveis e decoração',
  telefonia: 'Telefonia',
};

function formatCategories(value: string | null): string {
  if (!value) return 'Não informadas';
  return value.split(',').map((item) => {
    const category = item.trim();
    const key = category.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
    return CATEGORY_LABELS[key] ?? category.replaceAll('_', ' ').toLocaleLowerCase('pt-BR').split(/([\s-]+)/).map((part) => (
      /^[\s-]+$/.test(part) ? part : part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1)
    )).join('');
  }).join(', ');
}

function formatPayments(value: string | null): string {
  if (!value) return 'Não informadas';
  return value.split(',').map((item) => {
    const payment = item.trim();
    return PAYMENT_LABELS[payment] ?? payment;
  }).join(', ');
}

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchTicket = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE}/tickets/${params.id}`);
        if (!response.ok) {
          throw new Error(response.status === 404 ? 'Pedido não encontrado.' : 'Não foi possível carregar o pedido.');
        }
        const data: Ticket = await response.json();
        if (!cancelled) setTicket(data);
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : 'Não foi possível carregar o pedido.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTicket();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const updateTicket = async (
    changes: Partial<Pick<Ticket, 'order_status' | 'priority'>>
  ) => {
    if (!ticket || updating) return;
    const previousTicket = ticket;
    setUpdating(true);
    setError(null);
    setNotice(null);
    setTicket({ ...ticket, ...changes, updated_at: new Date().toISOString() });
    try {
      const response = await fetch(`${API_BASE}/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!response.ok) {
        throw new Error('Não foi possível atualizar o pedido.');
      }
      const updated: Ticket = await response.json();
      setTicket(updated);
      setNotice({ message: 'Alteração salva com sucesso.', variant: 'success' });
    } catch (updateError) {
      setTicket(previousTicket);
      setNotice({
        message: updateError instanceof Error
          ? updateError.message
          : 'Não foi possível atualizar o pedido.',
        variant: 'error',
      });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <main className="page-shell" aria-busy="true" aria-label="Carregando pedido">
        <header className="page-header">
          <div>
            <div className="skeleton-line skeleton-eyebrow" />
            <div className="skeleton-line skeleton-heading" />
          </div>
          <div className="skeleton-line skeleton-button" />
        </header>
        <section className="ticket-card detail-skeleton" aria-hidden="true">
          <div className="skeleton-line skeleton-section-title" />
          <div className="ticket-grid">
            {[0, 1].map((column) => (
              <div className="skeleton-detail-column" key={column}>
                {[0, 1, 2, 3, 4].map((line) => (
                  <div className="skeleton-line skeleton-detail-line" key={line} />
                ))}
              </div>
            ))}
          </div>
          <div className="separator" />
          <div className="skeleton-line skeleton-section-title" />
          <div className="skeleton-line skeleton-detail-line skeleton-detail-control" />
          <div className="skeleton-line skeleton-detail-line skeleton-detail-control" />
        </section>
      </main>
    );
  }
  if (error && !ticket) {
    return <main className="page-shell"><p role="alert">{error}</p></main>;
  }
  if (!ticket) return <main className="page-shell"><p>Pedido não encontrado.</p></main>;

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Pedido Olist</p>
          <h1>{ticket.order_id}</h1>
        </div>
        <Link href="/tickets" className="secondary-button">
          Voltar ao quadro
        </Link>
      </header>

      {error && <p role="alert">{error}</p>}
      <section className="ticket-card">
        <h2>Dados do pedido</h2>
        <div className="ticket-grid">
          <div>
            <p><strong>ID do cliente:</strong> {ticket.customer_id}</p>
            {ticket.customer_unique_id && <p><strong>Cliente único:</strong> {ticket.customer_unique_id}</p>}
            <p><strong>Localização:</strong> {ticket.customer_city && ticket.customer_state ? `${formatCity(ticket.customer_city)}, ${ticket.customer_state}` : 'Não informada'}</p>
            <p><strong>Status do pedido:</strong> <span className="badge">{ORDER_STATUS_LABELS[ticket.order_status] ?? ticket.order_status}</span></p>
            <p><strong>Data da compra:</strong> {formatDate(ticket.order_purchase_timestamp)}</p>
            <p><strong>Data de aprovação:</strong> {formatDate(ticket.order_approved_at)}</p>
          </div>
          <div>
            <p><strong>Enviado à transportadora:</strong> {formatDate(ticket.order_delivered_carrier_date)}</p>
            <p><strong>Entregue ao cliente:</strong> {formatDate(ticket.order_delivered_customer_date)}</p>
            <p><strong>Previsão de entrega:</strong> {formatDate(ticket.order_estimated_delivery_date)}</p>
            <p><strong>Categorias dos itens:</strong> {formatCategories(ticket.product_categories)}</p>
            <p><strong>Quantidade de itens:</strong> {ticket.item_count ?? 'Não informada'}</p>
            <p><strong>Valor dos itens:</strong> {formatCurrency(ticket.items_total)}</p>
            <p><strong>Frete:</strong> {formatCurrency(ticket.freight_total)}</p>
            <p><strong>Valor pago:</strong> {formatCurrency(ticket.payment_total)}</p>
            <p><strong>Formas de pagamento:</strong> {formatPayments(ticket.payment_types)}</p>
          </div>
        </div>

        {ticket.order_status === 'delivered' &&
          (ticket.review_score !== null || ticket.review_comments) && (
          <>
            <div className="separator" />
            <h2>Avaliação do pedido entregue</h2>
            {ticket.review_score !== null && (
              <div className="review-rating">
                <span className="review-stars" aria-label={`${ticket.review_score.toFixed(1)} de 5 estrelas`}>
                  {'★'.repeat(Math.round(ticket.review_score))}
                  <span className="review-empty-stars">{'★'.repeat(5 - Math.round(ticket.review_score))}</span>
                </span>
                <strong>{ticket.review_score.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
                <span className="review-count">
                  {ticket.review_count && ticket.review_count > 1
                    ? `Média de ${ticket.review_count} avaliações`
                    : 'Avaliação do cliente'}
                </span>
              </div>
            )}
            {ticket.review_comments && <blockquote className="review-comment">{ticket.review_comments}</blockquote>}
          </>
        )}

        <div className="separator" />
        <h2>Atendimento</h2>
        <p className="field-help">O status do pedido é compartilhado com a coluna do kanban. A prioridade continua sendo uma informação interna.</p>
        <div className="ticket-fields">
          <label className="field-control">
            <strong>Status do pedido</strong>
            <select
              value={ticket.order_status}
              disabled={updating}
              onChange={(event) => {
                const value = event.target.value as (typeof ORDER_STATUSES)[number];
                void updateTicket({ order_status: value });
              }}
            >
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-control">
            <strong>Prioridade</strong>
            <select
              value={ticket.priority ?? ''}
              disabled={updating}
              onChange={(event) => {
                const value = event.target.value;
                if (value === '') {
                  void updateTicket({ priority: null });
                } else if (value === 'low' || value === 'medium' || value === 'high') {
                  void updateTicket({ priority: value });
                }
              }}
            >
              <option value="">Não definida</option>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </select>
          </label>
        </div>
        {updating && <p className="save-status">Salvando alteração…</p>}
        {ticket.updated_at && <p><strong>Última atualização:</strong> {formatDate(ticket.updated_at)}</p>}
      </section>
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
