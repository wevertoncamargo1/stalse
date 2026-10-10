# Stalse

Mini Inbox de pedidos Olist com API FastAPI, Next.js, métricas de avaliações e auditoria de alterações. O projeto pode rodar localmente sem deploy.

## Pré-requisitos e dados

Para rodar o projeto completo com Docker: Docker Desktop com Docker Compose v2. Sem Docker: Python 3.10+, Node.js 18+ e n8n; a análise local dos logs também precisa do Ollama e do modelo `llama3.2:3b`.

Os sete CSVs usados pela aplicação já estão em `data/raw/`; não é necessária conta, autenticação ou token Kaggle para avaliação. Eles vêm do [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce), disponibilizado sob a licença **CC BY-NC-SA 4.0**. A redistribuição neste repositório é para avaliação técnica não comercial; atribuição: Olist, *Brazilian E-Commerce Public Dataset*, Kaggle. Ao reutilizar os dados, mantenha a atribuição, respeite a licença não comercial e compartilhe adaptações sob os mesmos termos. O notebook de referência é [Olist eCommerce-Analytics, Quasi Poisson + Poly Regs](https://www.kaggle.com/code/anshumoudgil/olist-ecommerce-analytics-quasi-poisson-poly-regs).

Para baixar uma cópia atualizada do dataset manualmente, use a autenticação oficial do Kaggle:
```powershell
python -m pip install kaggle
kaggle auth login
New-Item -ItemType Directory -Force data\raw
kaggle datasets download -d olistbr/brazilian-ecommerce -p data/raw --unzip
```

Nunca coloque tokens ou credenciais no repositório.

## Rodar tudo com Docker Compose

Na raiz do projeto, execute:

```powershell
docker compose up --build
```

Esse único comando constrói e inicia frontend, API, n8n e Ollama. Na primeira execução, gera as métricas, importa os pedidos no SQLite, baixa o modelo Ollama (`llama3.2:3b`, cerca de 2 GB) e importa/ativa o workflow de auditoria automaticamente. O primeiro início pode demorar por causa dos downloads e da carga do banco. A base, os logs, os relatórios, os dados do n8n e o modelo ficam em volumes locais.

- Frontend: <http://localhost:3000/tickets>
- Métricas: <http://localhost:3000/dashboard>
- API e OpenAPI: <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>
- n8n: <http://localhost:5678>

Para abrir o editor do n8n e consultar execuções, crie o usuário proprietário no primeiro acesso; isso não é necessário para a API disparar o workflow. O arquivo versionado é importado e ativado na inicialização do container. Relatórios Markdown gerados ficam em `n8n/reports/`. Para encerrar: `docker compose down`; os volumes e dados locais permanecem. Para removê-los explicitamente, use `docker compose down -v`.

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
