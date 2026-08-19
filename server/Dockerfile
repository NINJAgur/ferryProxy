FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Dependencies first, so a code change does not reinstall them.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Purchases and this month's usage live here. Mount a volume at /data or every
# deploy resets everyone's allowance — the container filesystem does not survive.
ENV ENTITLEMENT_STORE_PATH=/data/entitlements.json
VOLUME ["/data"]

# Not root: a compromised relay holds four funded provider keys.
RUN useradd --create-home --uid 10001 ferry && mkdir -p /data && chown ferry /data
USER ferry

EXPOSE 8000

# One worker on purpose. Answer chunks are cached in memory, so a second worker
# would 404 on chunks the first one is holding. Scaling out needs a shared cache.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
