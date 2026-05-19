FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV TELEGRAM_DRIVE_DB_PATH=/app/data/telegram_drive.db
ENV TELEGRAM_DRIVE_SESSIONS_DIR=/app/sessions
ENV TELEGRAM_DRIVE_TEMP_DIR=/app/temp

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data /app/sessions /app/temp

VOLUME ["/app/data", "/app/sessions", "/app/temp"]

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
