# Stalse

MVP de atendimento com pedidos do Olist, quadro Kanban e métricas de avaliações. O projeto roda localmente; Vercel e Turso são opcionais.

## Rodar localmente

Requisitos: Python 3.10+ e Node.js 18+.

1. Crie um ambiente Python e instale as dependências:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

2. Configure o Kaggle CLI, autentique-se e baixe o dataset Olist:

```powershell
python -m pip install kaggle
kaggle auth login
New-Item -ItemType Directory -Force data\raw
kaggle datasets download -d olistbr/brazilian-ecommerce -p data/raw --unzip
```

O backend precisa dos CSVs de pedidos, clientes, itens, produtos, tradução de categorias, pagamentos e avaliações em `data/raw/`. O ETL lê `olist_order_reviews_dataset.csv`.

Dataset: [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce). Notebook de referência solicitado: [Olist eCommerce-Analytics, Quasi Poisson + Poly Regs](https://www.kaggle.com/code/anshumoudgil/olist-ecommerce-analytics-quasi-poisson-poly-regs). Respeite a licença e os termos de uso do Kaggle.

3. Gere as métricas e inicie a API:

```powershell
python data\etl.py
python -m uvicorn main:app --app-dir backend --reload --port 8000
```

O SQLite é criado em `backend/db.sqlite`. Não apague esse arquivo se quiser preservar os status e prioridades editados localmente.

4. Em outro terminal, instale e inicie o frontend:

```powershell
cd frontend
npm ci
npm run dev
```

Acesse [Pedidos](http://localhost:3000/tickets) e [Avaliações e métricas](http://localhost:3000/dashboard). Sem `NEXT_PUBLIC_API_URL`, o frontend usa `http://localhost:8000`.

## Dados e comportamento

- As métricas de avaliações vêm de `olist_order_reviews_dataset.csv`; os dados de pedidos vêm de `olist_orders_dataset.csv`.
- Clientes, itens, produtos, pagamentos e avaliações enriquecem os detalhes dos pedidos. O status do pedido alimenta as colunas do Kanban e as métricas de pedidos.
- As colunas são Criados, Em processamento, Aprovados, Indisponíveis, Faturado, Enviados, Cancelados e Entregues. A prioridade é sorteada uma vez na inicialização do banco local e não representa um dado original do Olist.
- Avaliações só aparecem nos detalhes de pedidos entregues. O dataset não fornece nome nem canal de contato do cliente.

## Webhook n8n — integração em construção

O backend já tem o envio HTTP esboçado via `N8N_WEBHOOK_URL` (padrão local: `http://localhost:5678/webhook/stalse-ticket`). O workflow em `n8n/workflow.json` ainda é um exemplo: seu destino HTTP atual é `httpbin.org/post`, não uma tarefa final do n8n.

Exemplo do payload enviado quando o status muda ou a prioridade passa para alta:

```json
{
  "event": "ticket_updated",
  "ticket_id": 123,
  "order_id": "10a045cdf6a5650c21e9cfeb60384c16",
  "status": "delivered",
  "priority": "high",
  "order_status": "delivered",
  "updated_at": "2026-10-10T13:00:00"
}
```

## Deploy opcional

Para Vercel, o frontend usa `NEXT_PUBLIC_API_URL`; o backend usa `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` e `CORS_ORIGINS`. Sem `TURSO_*`, a API usa o SQLite local. A carga de Turso é explícita e separada do fluxo local; veja `backend/seed_turso.py`.

## Git Flow

Use `feature/*` a partir de `develop`, faça commits pequenos, integre a feature em `develop` após validar e promova `develop` para `main` quando estiver pronto para produção.
