# Desafio Técnico Stalse

Este repositório contém um MVP full-stack para o desafio de suporte da Stalse.

## Stack
- Python + FastAPI + SQLite
- Next.js + App Router
- Pipeline ETL com pandas
- Automação com webhook do n8n

## Estrutura do projeto

```text
/backend
  main.py
  requirements.txt
  db.sqlite        # gerado localmente
/data
  etl.py
  raw/                     # CSVs selecionados do Kaggle (não versionados)
  kaggle_notebook/          # código e metadados do kernel solicitado
  processed/metrics.json    # gerado pelo ETL
/frontend
  app/...
  package.json
/n8n
  workflow.json
  screenshot.png
README.md
```

## Backend

Na primeira inicialização, o backend importa as tabelas selecionadas do Kaggle
para o SQLite e prepara índices de busca. Essa carga inicial pode levar um
pouco; as próximas inicializações reutilizam os dados processados.

### Requisitos
```bash
cd backend
python -m pip install -r requirements.txt
```

### Rodar localmente
```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Endpoints disponíveis
- GET /health
- GET /tickets (busca com `q`, paginação com `limit` e `offset`)
- GET /tickets/board (colunas e totais do kanban, busca com `q`)
- GET /tickets/{id}
- PATCH /tickets/{id} (atualiza status logístico/prioridade no SQLite)
- GET /metrics

### Exemplo de payload para PATCH
```json
{
  "order_status": "delivered",
  "priority": "high"
}
```

## Dados e ETL

O projeto usa tabelas relacionadas do [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce). `olist_order_reviews_dataset.csv` alimenta as métricas do dashboard. A área de atendimento usa `olist_orders_dataset.csv` e enriquece os pedidos, pelo `order_id`, com reviews, itens, produtos/categorias, pagamentos e localização do cliente. O kernel [Olist eCommerce-Analytics, Quasi Poisson+Poly Regs](https://www.kaggle.com/code/anshumoudgil/olist-ecommerce-analytics-quasi-poisson-poly-regs) foi baixado para `data/kaggle_notebook/` como referência.

O Olist não fornece nome do cliente, canal de contato, texto de assunto do chamado nem prioridade. Mostramos o ID e a localização do cliente, categorias reais dos produtos e comentários reais das reviews quando disponíveis. Os nomes de cidades do CSV original vêm sem acentos; a interface restaura a grafia acentuada das cidades mais comuns e a busca funciona com ou sem acentos, sem alterar o texto original armazenado. Os códigos de status no backend e no SQLite permanecem em inglês. O status logístico do pedido é também o status usado no kanban e nas métricas; as colunas aparecem nesta ordem: Criados, Em processamento, Aprovados, Indisponíveis, Faturado, Enviados, Cancelados e Entregues. Arrastar um pedido entre colunas atualiza o status no SQLite. Para fins de demonstração, a prioridade é sorteada uma única vez na primeira inicialização que aplica essa migração, persistida no banco e exibida da maior para a menor dentro de cada coluna; ela não representa uma prioridade real do Olist. Uma avaliação só aparece dentro do detalhe do pedido quando o status é `delivered` (entregue).

### Autenticar e baixar

Instale a CLI oficial do Kaggle e autentique-se sem colocar tokens no repositório:

```bash
python -m pip install kaggle
kaggle auth login
```

Baixe as tabelas utilizadas:

```bash
kaggle datasets download -d olistbr/brazilian-ecommerce -f olist_order_reviews_dataset.csv -p data/raw
Expand-Archive -LiteralPath data/raw/olist_order_reviews_dataset.csv.zip -DestinationPath data/raw
kaggle datasets download -d olistbr/brazilian-ecommerce -f olist_orders_dataset.csv -p data/raw
Expand-Archive -LiteralPath data/raw/olist_orders_dataset.csv.zip -DestinationPath data/raw
kaggle datasets download -d olistbr/brazilian-ecommerce -f olist_customers_dataset.csv -p data/raw
Expand-Archive -LiteralPath data/raw/olist_customers_dataset.csv.zip -DestinationPath data/raw
kaggle datasets download -d olistbr/brazilian-ecommerce -f olist_order_items_dataset.csv -p data/raw
Expand-Archive -LiteralPath data/raw/olist_order_items_dataset.csv.zip -DestinationPath data/raw
kaggle datasets download -d olistbr/brazilian-ecommerce -f olist_products_dataset.csv -p data/raw
Expand-Archive -LiteralPath data/raw/olist_products_dataset.csv.zip -DestinationPath data/raw
kaggle datasets download -d olistbr/brazilian-ecommerce -f product_category_name_translation.csv -p data/raw
Expand-Archive -LiteralPath data/raw/product_category_name_translation.csv.zip -DestinationPath data/raw
kaggle datasets download -d olistbr/brazilian-ecommerce -f olist_order_payments_dataset.csv -p data/raw
Expand-Archive -LiteralPath data/raw/olist_order_payments_dataset.csv.zip -DestinationPath data/raw
```

Extraia todos os ZIPs antes de iniciar o backend. Na inicialização, o banco
SQLite importa tabelas que ainda não tenham sido carregadas e aplica as
migrações necessárias sem apagar os pedidos já existentes. Não apague
`backend/db.sqlite`: isso também apagaria os dados locais. Migrações únicas
removem os status preenchidos automaticamente nas versões anteriores e sorteiam
uma prioridade baixa, média ou alta para cada pedido. O sorteio não se repete
nas inicializações seguintes.

No PowerShell, remova os ZIPs depois de extrair:

```powershell
Remove-Item data/raw/*.zip
```

Os CSVs e ZIPs estão no `.gitignore` e não serão enviados ao GitHub. O dataset tem licença **CC BY-NC-SA 4.0**; consulte os termos na página do Kaggle antes de redistribuí-lo ou usar os dados comercialmente.

Ao iniciar, o backend importa e relaciona as tabelas no SQLite. A tela de pedidos é um kanban com uma coluna para cada status logístico original; arrastar um card altera o status do pedido e as métricas usam o mesmo campo. Uma confirmação temporária aparece em um Snackbar verde após sucesso ou vermelho se a atualização falhar. A busca é automática após 350 ms sem digitação. Os pedidos são carregados em lotes por coluna para manter a interface responsiva com o dataset completo.

### Gerar métricas

```bash
python data/etl.py
```

O ETL usa as colunas `review_creation_date` e `review_score` para calcular o
total de avaliações, a nota média, a distribuição de notas e, para cada mês,
a quantidade de reviews e a nota média. O endpoint `GET /metrics` também acrescenta métricas reais de
pedidos calculadas do SQLite: contagem por status logístico/kanban e as dez
cidades com mais pedidos/clientes. Os agregados de review continuam usando
somente a tabela de reviews; status e prioridade dos pedidos não são misturados
às avaliações.

Para usar outro caminho ou nomes de colunas diferentes:

```bash
python data/etl.py --input "data/raw/meu_dataset.csv" --date-column "Review Date" --rating-column "Score"
```

O script processa o CSV com pandas e gera as métricas em
`data/processed/metrics.json`, arquivo lido pelo endpoint `GET /metrics`.
Datas, notas ou categorias inválidas são ignoradas e contabilizadas em um aviso.

## Frontend

### Requisitos
```bash
cd frontend
npm install
```

### Rodar localmente
```bash
cd frontend
npm run dev
```

Depois abra:
- http://localhost:3000/
- http://localhost:3000/tickets
- http://localhost:3000/dashboard

Na tela de pedidos, use os botões **Kanban** e **Lista** ao lado da busca para
alternar a visualização. Ambas usam os mesmos dados, busca e prioridade; a lista
carrega os próximos pedidos em lotes. Em telas menores, a lista reorganiza os
dados em cartões e o Kanban mantém rolagem horizontal para preservar as colunas.

### Deploy do frontend na Vercel

O frontend pode ser publicado na Vercel separado da API:

1. Importe o repositório na Vercel e defina `frontend` como **Root Directory**.
2. Mantenha o preset **Next.js** e configure a variável de ambiente
   `NEXT_PUBLIC_API_URL` com a URL pública da API FastAPI (sem barra final).
3. Publique o projeto. A URL da Vercel deve ser incluída também em
   `CORS_ORIGINS` no serviço que hospeda a API.

A API não deve ser executada na Vercel nesta configuração: ela depende de SQLite
gravável e dos arquivos CSV do Olist. Hospede-a em um serviço com disco
persistente, configure `DATABASE_PATH` para um arquivo nesse disco e disponibilize
os CSVs em `data/raw` antes da primeira inicialização. Configure
`CORS_ORIGINS` como uma lista de origens separadas por vírgula, incluindo a URL
de produção da Vercel; localmente, as origens localhost são permitidas por
padrão. A API e os dados não são publicados pela configuração do frontend.

## Workflow do n8n

O arquivo `n8n/workflow.json` contém um webhook que recebe alterações nos status logísticos do pedido ou na prioridade e encaminha o payload para um endpoint HTTP.

### Exemplo de payload do webhook
```json
{
  "event": "ticket_updated",
  "ticket_id": 123,
  "order_id": "10a045cdf6a5650c21e9cfeb60384c16",
  "status": "delivered",
  "priority": "low",
  "order_status": "delivered",
  "updated_at": "2026-10-10T10:00:00"
}
```

## Observações

- A API está configurada para aceitar requisições do frontend local em `http://localhost:3000`.
- O backend dispara o webhook do n8n quando o status do pedido muda ou quando a prioridade muda para `high`.
- As métricas do dashboard continuam usando somente a tabela de reviews, conforme solicitado. As demais tabelas enriquecem os cards de pedidos, mas não alteram os agregados de avaliações.
- Este é um MVP local e foi pensado para rodar sem deploy externo.
