FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# I finti fornitori. Il generatore sta nella stessa immagine e si lancia
# sovrascrivendo il comando (vedi il README).
WORKDIR /app/mocks
CMD ["python", "main.py"]
