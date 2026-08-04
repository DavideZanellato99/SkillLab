#!/usr/bin/env bash
# Scrive i due .env che servono ad avviare lo stack di produzione dentro la CI.
#
# Sta in uno script e non dentro i workflow perché lo usano in due, lo smoke
# test di ci.yml e la scansione DAST di security.yml, e finché era copiato in
# entrambi bastava aggiungere una variabile obbligatoria al backend per far
# cadere solo uno dei due, con un container che si rifiuta di partire e un
# messaggio che non dice da dove viene la differenza.
#
# Va lanciato dalla radice del repo.
set -euo pipefail

# docker-compose.yml non ha default per queste e si rifiuta di partire senza,
# esattamente come su una macchina vera. Valori usa e getta: questo database
# vive quanto il job.
#
# SITE_ADDRESS a ":80" serve in chiaro: il default "localhost" farebbe emettere
# a Caddy un certificato con la sua CA interna e reindirizzare da HTTP, e i
# client (curl, e lo spider di ZAP) si fermerebbero sul certificato
# sconosciuto. Qui interessa che lo stack risponda, non che TLS funzioni.
cat > .env <<'EOF'
POSTGRES_USER=skilllab
POSTGRES_PASSWORD=smoketest
POSTGRES_DB=skilllab_db
SITE_ADDRESS=:80
BACKEND_REPLICAS=2
BACKEND_CPUS=1.0
BACKEND_MEM=1G
DB_CPUS=1.0
DB_MEM=1G
DB_MEM_RESERVED=256M
DB_MAX_CONNECTIONS=100
EOF

# Valori segnaposto: bastano ad avviare il backend, che nella CI non chiama mai
# le API esterne (lo smoke test tocca solo la rotta di salute, e la scansione
# DAST si ferma davanti al login). In compose DATABASE_URL viene sovrascritta
# per puntare al servizio "db".
#
# Ogni variabile OBBLIGATORIA deve stare qui o il container si rifiuta di
# partire, ed è voluto: questo file è il controllo che la regola "nessun
# default per ciò che conta" resti vera.
cat > backend/.env <<'EOF'
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/skilllab_db
ALLOWED_ORIGINS=http://localhost
COGNITO_REGION=eu-west-1
COGNITO_USER_POOL_ID=
COGNITO_APP_CLIENT_ID=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
OPENAI_EVAL_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_FALLBACK_MODELS=
OPENAI_EVAL_FALLBACK_MODELS=
CARTESIA_API_KEY=
CARTESIA_MODEL=sonic-2
CARTESIA_VERSION=2024-11-13
CARTESIA_LANGUAGE=it
CARTESIA_DEFAULT_VOICE_ID=
CARTESIA_TTS_WS_URL=wss://api.cartesia.ai/tts/websocket
ELEVENLABS_API_KEY=
ELEVENLABS_STT_MODEL=scribe_v1
ELEVENLABS_STT_LANGUAGE=it
ELEVENLABS_VAD_SILENCE_SECS=0.8
ELEVENLABS_VAD_THRESHOLD=0.5
ELEVENLABS_STT_WS_URL=wss://api.elevenlabs.io/v1/speech-to-text/stream
VOICE_LATENCY_LOG=1
VOICE_STT_DEBUG=0
MAX_CONCURRENT_CALLS=20
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=15
AUDIT_LOG_RETENTION_DAYS=180
AUDIO_RECORDING_RETENTION_DAYS=90
CONVERSATION_RETENTION_DAYS=730
SIMULATION_ATTEMPT_RETENTION_DAYS=730
EOF
