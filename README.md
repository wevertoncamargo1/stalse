Stalse - Mini Inbox OlistDesafio técnico FullStack envolvendo Python (FastAPI + SQLite), Next.js (App Router), pandas (ETL) e n8n.   

🚀 Como Rodar Rapidamente (Docker)Com o Docker Desktop aberto, execute na raiz do projeto:

PowerShell: docker compose up --build
Frontend: http://localhost:3000/tickets
Dashboard de Métricas: http://localhost:3000/dashboard
API / Swagger Docs: http://localhost:8000/docs
n8n: http://localhost:5678(Nota: Na primeira execução, o container baixa o dataset, gera as métricas, sobe o SQLite e configura o Ollama para a auditoria de logs).

🛠️ Como Rodar Sem Docker (Local)

1. Backend & ETL
PowerShell:

"py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python data\etl.py
python -m uvicorn main:app --app-dir backend --reload --port 8000"

2. Frontend

PowerShell:

"cd frontend
npm ci
npm run dev"

📊 Origem dos Dados

Dataset: Brazilian E-Commerce Public Dataset by Olist (Kaggle) (Licença CC BY-NC-SA 4.0).
Os 7 CSVs já estão compactados em data/raw/ para facilitar a avaliação sem necessidade de tokens do Kaggle.

⚙️ Diferenciais

Interface Avançada: Kanban e lista paginada em Next.js com Tailwind/Shadcn, estados de skeleton, filtros combinados e identificação local de operadores.

Auditoria e n8n: Alterações de status (PATCH /tickets/{id}) disparam eventos para o n8n e geram relatórios automatizados de auditoria integrados com IA local (Ollama / Llama 3.2).

Deploy na Vercel: O frontend está online na Vercel.
Nota sobre o n8n em produção: Por limitações de infraestrutura gratuita na Vercel e custos de n8n Cloud, o webhook ativo e o processamento do n8n rodam nativamente via Docker Compose local ou conforme instruções do repositório.

📂 Estrutura e Exemplo de Payload do Webhook

O workflow exportado do n8n está em n8n/workflow.json e a captura de tela ativa junto com o video em screenshots/image.png.  

 Exemplo do payload enviado no evento de ticket fechado/prioridade alta:JSON{
  "event": "ticket_review_requested",
  "triggers": ["priority_high"],
  "actor": "Operador local",
  "ticket_id": 123,
  "order_id": "10a045cdf6a5650c21e9cfeb60384c16",
  "ticket_status": "open",
  "order_status": "processing",
  "priority": "high",
  "updated_at": "2026-10-10T13:00:00",
  "logs_window_minutes": 15,
  "logs": []
}

Documentação completa da API disponível em /docs ou via ReDoc em /redoc. Captura em screenshots/api-docs.png.