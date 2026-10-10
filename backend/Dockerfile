FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY data/etl.py /app/data/etl.py

ENV PYTHONUNBUFFERED=1
ENV DATABASE_PATH=/app/data/stalse.sqlite
ENV ACTIVITY_LOG_PATH=/app/data/processed/activity.jsonl
ENV N8N_WEBHOOK_URL=http://n8n:5678/webhook/stalse-ticket

EXPOSE 8000

CMD ["sh", "-c", "python /app/data/etl.py && python -m uvicorn main:app --app-dir /app/backend --host 0.0.0.0 --port 8000"]
