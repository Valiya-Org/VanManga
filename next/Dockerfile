# ── Build stage: install Python dependencies ──────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# lxml 需要 libxml2/libxslt；cryptography wheel 通常预编译，无需 build-essential
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxml2 \
        libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# 运行时共享库（lxml）
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxml2 \
        libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*

# �� builder 复制已安装的包
COPY --from=builder /install /usr/local

# 应用代码
COPY app/    ./app/
COPY main.py .

# 持久化数据目录（容器内默认路径，可通过卷覆盖）
RUN mkdir -p data manga logs

# 非 root 用户运行
RUN useradd -m -u 1000 vanmanga && chown -R vanmanga:vanmanga /app
USER vanmanga

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/api/sources')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "1"]
