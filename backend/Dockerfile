FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Trust an extra local root CA if present (e.g. an antivirus/corporate TLS
# inspection root — see the truststore usage in main.py for why this is
# needed at runtime too). The glob copy is a no-op when the file doesn't
# exist, so this stays harmless on machines without one.
COPY avast-root.cr[t] /usr/local/share/ca-certificates/avast-root.crt
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV PIP_CERT=/etc/ssl/certs/ca-certificates.crt

# Install Python deps first so this layer is cached unless requirements change
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
