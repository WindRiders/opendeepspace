# ── DeepSpace Docker Image ──────────────────────
# Multi-stage build for production readiness.
#
# Build:  docker build -t windriders/opendeepspace .
# Run:    docker run -d --name deepspace \
#           -e DASHSCOPE_API_KEY=sk-xxx \
#           -p 8645:8645 windriders/opendeepspace
#
# Requires: docker-compose.yml running (for databases)
# Or use docker-compose to start everything together.

FROM python:3.12-slim AS builder

WORKDIR /app

# Install build deps
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Copy just the package metadata first for caching
COPY pyproject.toml README.md ./

# Install with no deps yet (just to get the package structure)
RUN pip install --no-cache-dir -e . > /dev/null 2>&1 || true

# Now copy source and install proper
COPY core/ ./core/
COPY storage/ ./storage/
COPY api/ ./api/
COPY cli/ ./cli/
COPY integrations/ ./integrations/
COPY config/ ./config/
COPY scripts/ ./scripts/

RUN pip install --no-cache-dir -e .


FROM python:3.12-slim

WORKDIR /app

# Runtime deps only
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin/deepspace /usr/local/bin/deepspace

# Copy configs
COPY config/ ./config/
COPY docker-compose.yml ./docker-compose.yml
COPY scripts/ ./scripts/

# Create data directory
RUN mkdir -p /app/data

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8645/health')" || exit 1

EXPOSE 8645

# Default: start API server
CMD ["python", "-m", "uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8645"]

LABEL org.opencontainers.image.title="opendeepspace"
LABEL org.opencontainers.image.description="DeepSpace — Autonomous Learning Memory System"
LABEL org.opencontainers.image.source="https://github.com/WindRiders/opendeepspace"
LABEL org.opencontainers.image.version="0.8.1"
LABEL org.opencontainers.image.licenses="MIT"