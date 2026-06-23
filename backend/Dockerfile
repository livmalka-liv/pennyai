FROM python:3.12-slim

WORKDIR /app

# cache-bust: 2026-06-23h
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    python -c "import email_validator; import psycopg2; print('deps OK')"

COPY . .

EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
