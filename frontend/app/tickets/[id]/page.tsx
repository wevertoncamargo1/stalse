'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatCity } from '../../format-city';
import { getOperatorHeaders, useOperatorName } from '../../operator';
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
  status: 'open' | 'closed' | null;
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
  const operator = useOperatorName();

  useEffect(() => {
    let cancelled = false;
    const fetchTicket = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE}/tickets/${params.id}`, {
          headers: getOperatorHeaders(),
        });
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
    if (!operator.trim()) {
      setNotice({ message: 'Informe o operador antes de alterar o pedido.', variant: 'error' });
      return;
    }
    const previousTicket = ticket;
    setUpdating(true);
    setError(null);
    setNotice(null);
    setTicket({ ...ticket, ...changes, updated_at: new Date().toISOString() });
    try {
      const response = await fetch(`${API_BASE}/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getOperatorHeaders() },
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
    <main className="page-shell detail-page">
      <header className="detail-header">
        <div className="detail-heading">
          <p className="eyebrow">Detalhes do pedido</p>
          <div className="detail-title-line">
            <h1>Pedido <span>#{ticket.order_id}</span></h1>
            <span className={`badge status-${ticket.status ?? 'open'}`}>
              {ticket.status === 'closed' ? 'Ticket fechado' : 'Ticket aberto'}
            </span>
          </div>
          <p className="detail-header-meta">
            Compra em {formatDate(ticket.order_purchase_timestamp)}
          </p>
        </div>
        <Link href="/tickets" className="secondary-button">
          <span aria-hidden="true">←</span> Voltar ao quadro
        </Link>
      </header>

      {error && <p role="alert">{error}</p>}
      <div className="detail-layout">
        <div className="detail-main">
          <section className="detail-card customer-summary">
            <div className="customer-identity">
              <span className="customer-avatar" aria-hidden="true">O</span>
              <div>
                <span className="detail-overline">PERFIL DO CLIENTE</span>
                <h2>Cliente Olist</h2>
                <p>{ticket.customer_city && ticket.customer_state
                  ? `${formatCity(ticket.customer_city)}, ${ticket.customer_state}`
                  : 'Localização não informada'}</p>
              </div>
            </div>
            <div className="customer-identifiers">
              <div>
                <span>ID do cliente</span>
                <code>{ticket.customer_id}</code>
              </div>
              {ticket.customer_unique_id && (
                <div>
                  <span>Cliente recorrente</span>
                  <code>{ticket.customer_unique_id}</code>
                </div>
              )}
            </div>
          </section>

          <section className="detail-card">
            <div className="detail-section-heading">
              <div>
                <span className="detail-overline">VISÃO GERAL</span>
                <h2>Resumo do pedido</h2>
              </div>
              <span className="badge order-status-badge">
                {ORDER_STATUS_LABELS[ticket.order_status] ?? ticket.order_status}
              </span>
            </div>
            <div className="order-summary-grid">
              <div className="order-summary-item">
                <span>Itens no pedido</span>
                <strong>{ticket.item_count ?? '—'}</strong>
              </div>
              <div className="order-summary-item">
                <span>Valor dos itens</span>
                <strong>{formatCurrency(ticket.items_total)}</strong>
              </div>
              <div className="order-summary-item order-summary-total">
                <span>Total pago</span>
                <strong>{formatCurrency(ticket.payment_total)}</strong>
              </div>
            </div>
            <div className="order-info-row">
              <span className="order-info-icon" aria-hidden="true">◇</span>
              <div>
                <span className="detail-overline">CATEGORIA</span>
                <strong>{formatCategories(ticket.product_categories)}</strong>
              </div>
            </div>
            <div className="order-info-row">
              <span className="order-info-icon" aria-hidden="true">↗</span>
              <div>
                <span className="detail-overline">PAGAMENTO</span>
                <strong>{formatPayments(ticket.payment_types)}</strong>
                <small>Frete: {formatCurrency(ticket.freight_total)}</small>
              </div>
            </div>
          </section>

          {ticket.order_status === 'delivered' &&
            (ticket.review_score !== null || ticket.review_comments) && (
            <section className="detail-card review-card">
              <div className="detail-section-heading">
                <div>
                  <span className="detail-overline">VOZ DO CLIENTE</span>
                  <h2>Avaliação do pedido</h2>
                </div>
              </div>
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
            </section>
          )}
        </div>

        <aside className="detail-sidebar">
          <section className="detail-card atendimento-card">
            <div className="detail-section-heading">
              <div>
                <span className="detail-overline">GESTÃO INTERNA</span>
                <h2>Atendimento</h2>
              </div>
              <span className={`badge status-${ticket.status ?? 'open'}`}>
                {ticket.status === 'closed' ? 'Fechado' : 'Aberto'}
              </span>
            </div>
            <p className="field-help">O status acompanha a coluna do quadro. A prioridade é interna.</p>
            {!operator.trim() && <p className="field-help">Informe seu nome no menu lateral para registrar alterações.</p>}
            <div className="action-group">
              <span className="action-label">Status do pedido</span>
              <div className="chip-buttons" role="group" aria-label="Alterar status do pedido">
                {ORDER_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={ticket.order_status === status ? 'is-active' : ''}
                    aria-pressed={ticket.order_status === status}
                    disabled={updating || !operator.trim() || ticket.order_status === status}
                    onClick={() => void updateTicket({ order_status: status })}
                  >
                    {ORDER_STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
              <div className="quick-actions">
                {ticket.status === 'closed' ? (
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={updating || !operator.trim()}
                    onClick={() => void updateTicket({ order_status: 'processing' })}
                  >
                    Reabrir ticket
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={updating || !operator.trim()}
                    onClick={() => void updateTicket({ order_status: 'delivered' })}
                  >
                    Fechar ticket (marcar como entregue)
                  </button>
                )}
              </div>
            </div>
            <div className="action-group">
              <span className="action-label">Prioridade</span>
              <div className="chip-buttons" role="group" aria-label="Alterar prioridade">
                {([
                  { value: null, label: 'Sem prioridade' },
                  { value: 'low', label: 'Baixa' },
                  { value: 'medium', label: 'Média' },
                  { value: 'high', label: 'Alta' },
                ] as const).map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={`${ticket.priority === option.value ? 'is-active' : ''} chip-${option.value ?? 'none'}`}
                    aria-pressed={ticket.priority === option.value}
                    disabled={updating || !operator.trim() || ticket.priority === option.value}
                    onClick={() => void updateTicket({ priority: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="field-help">Fechar o ticket ou marcar prioridade alta dispara a auditoria.</p>
            </div>
            {updating && <p className="save-status">Salvando alteração…</p>}
            {ticket.updated_at && (
              <p className="detail-updated"><strong>Última atualização</strong>{formatDate(ticket.updated_at)}</p>
            )}
          </section>
        </aside>
      </div>
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
