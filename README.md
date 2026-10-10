# Stalse

Mini Inbox de pedidos Olist com API FastAPI, Next.js, métricas de avaliações e auditoria de alterações. O projeto pode rodar localmente sem deploy.

## Pré-requisitos e dados

Para rodar o projeto completo com Docker: Docker Desktop com Docker Compose v2. Sem Docker: Python 3.10+, Node.js 18+ e n8n; a análise local dos logs também precisa do Ollama e do modelo `llama3.2:3b`.

Baixe os CSVs do [dataset Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce). O backend usa pedidos, clientes, itens, produtos, tradução de categorias, pagamentos e reviews; o ETL lê `olist_order_reviews_dataset.csv`. O notebook de referência é [Olist eCommerce-Analytics, Quasi Poisson + Poly Regs](https://www.kaggle.com/code/anshumoudgil/olist-ecommerce-analytics-quasi-poisson-poly-regs).

```powershell
python -m pip install kaggle
kaggle auth login
New-Item -ItemType Directory -Force data\raw
kaggle datasets download -d olistbr/brazilian-ecommerce -p data/raw --unzip
```

Respeite a licença e os termos do Kaggle. Não coloque tokens de API no repositório.

## Rodar tudo com Docker Compose

Com os CSVs em `data/raw/`, execute na raiz:

```powershell
docker compose up --build
```

Primeira inicialização instala as dependências, gera as métricas, importa pedidos no SQLite e baixa o modelo Ollama (`llama3.2:3b`, alguns GB). A base, os logs, os relatórios, os dados do n8n e o modelo ficam em volumes locais.

- Frontend: <http://localhost:3000/tickets>
- Métricas: <http://localhost:3000/dashboard>
- API e OpenAPI: <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>
- n8n: <http://localhost:5678>

No primeiro acesso ao n8n, crie o usuário proprietário. Depois importe e ative o workflow (uma vez):

```powershell
docker compose stop n8n
docker compose run --rm --no-deps n8n import:workflow --input=/files/n8n/workflow.json
docker compose start n8n
```

Ative **Stalse - Auditoria inteligente de tickets** no editor do n8n. Relatórios Markdown gerados ficam em `n8n/reports/`. Para encerrar: `docker compose down`; os volumes nomeados e os dados locais permanecem. Para removê-los explicitamente, use `docker compose down -v`.

## Rodar sem Docker

Crie um ambiente, instale as dependências, gere as métricas e inicie a API:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python data\etl.py
python -m uvicorn main:app --app-dir backend --reload --port 8000
```

Em outro terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Se a intenção for usar o webhook, inicie também n8n e Ollama e configure `N8N_WEBHOOK_URL` para `http://localhost:5678/webhook/stalse-ticket`. Importe e ative `n8n/workflow.json` uma vez no n8n e baixe o modelo com `ollama pull llama3.2:3b`. A configuração do operador fica no navegador; informe seu nome no campo **Operador** antes de alterar um pedido.

O SQLite local é criado em `backend/db.sqlite`; não o remova se quiser preservar as alterações. No primeiro início após esta versão, os tickets são inicializados como **fechados** para pedidos entregues/cancelados e **abertos** para os demais; todas as prioridades começam sem valor. Depois dessa migração única, status, prioridades e histórico persistem normalmente.

## Comportamento e auditoria

- Os oito status logísticos do Olist seguem como colunas do Kanban. Eles são distintos do estado de atendimento do ticket: entregue ou cancelado significa **fechado**; os outros status significam **aberto**.
- O filtro de tickets permite combinar busca, estado aberto/fechado e prioridade. O backend mantém paginação e ordenação de prioridade.
- `PATCH /tickets/{id}` registra operador, horário, status/prioridade anteriores e novos. A UI guarda o nome informado no `localStorage`; isso identifica o nome declarado pelo operador, não é autenticação de identidade.
- Requisições às rotas de tickets/métricas e alterações são gravadas em `data/processed/activity.jsonl` e no banco. Ao fechar um ticket ou mudar a prioridade para alta, o backend envia ao n8n o evento e até 200 registros dos últimos 15 minutos.
- O workflow usa limiares verificáveis para sinalizar 3 ou mais erros HTTP 5xx, 3 ou mais requisições com duração de pelo menos 3 segundos, ou 20 ou mais requisições atribuídas ao mesmo operador na janela. O Ollama local também analisa o contexto; o fluxo divide o resultado e salva um relatório Markdown por evento. É uma triagem indicativa, não prova causa ou autoria. Uma indisponibilidade total sem requisições registradas não pode ser inferida somente desses logs.

Exemplo reduzido do POST:

```json
{
  "event": "ticket_review_requested",
  "triggers": ["priority_high"],
  "actor": "Nome do operador",
  "ticket_id": 123,
  "order_id": "10a045cdf6a5650c21e9cfeb60384c16",
  "ticket_status": "open",
  "order_status": "processing",
  "priority": "high",
  "updated_at": "2026-10-10T13:00:00",
  "logs_window_minutes": 15,
  "logs": []
}
```

## API e imagens

FastAPI publica o Swagger UI interativo em `/docs` e a documentação ReDoc em `/redoc`. Uma captura da documentação está em [screenshots/api-docs.png](./screenshots/api-docs.png).

O workflow n8n exportado está em [n8n/workflow.json](./n8n/workflow.json). A captura do workflow deve ser atualizada após importar e ativar a nova versão no n8n.

## Deploy opcional

Para produção, o frontend usa `NEXT_PUBLIC_API_URL`; a API pode usar `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`, e `CORS_ORIGINS` define os domínios permitidos. A configuração Vercel não dá persistência ao arquivo JSONL; as alterações do ticket e logs operacionais são persistidos no banco remoto. O carregamento inicial no Turso é feito separadamente por `backend/seed_turso.py`.

A Vercel hospeda o frontend e não executa o n8n. Para os alertas de fechamento e prioridade alta funcionarem em produção, publique o n8n em um endereço acessível pela API e configure `N8N_WEBHOOK_URL` no ambiente do backend com a URL HTTPS do webhook. O padrão `localhost:5678` serve apenas para desenvolvimento local; uma instância n8n local não pode ser acessada pela API hospedada na Vercel.

## Git Flow

Crie `feature/*` a partir de `develop`, faça commits pequenos, integre a feature em `develop` após validar e promova `develop` para `main` quando estiver pronto para produção.
