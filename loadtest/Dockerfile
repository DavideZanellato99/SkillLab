FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Non root, come le altre due immagini: gira solo durante i test di carico, ma
# è comunque un container che ascolta sulla rete, e Trivy lo controlla insieme
# agli altri (DS-0002). UID numerico perché il nome esiste solo qui dentro.
RUN useradd --create-home --uid 10001 loadtest
USER 10001

# I finti fornitori. Il generatore sta nella stessa immagine e si lancia
# sovrascrivendo il comando (vedi il README).
WORKDIR /app/mocks
CMD ["python", "main.py"]
