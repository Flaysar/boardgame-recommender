FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc g++ && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ENV PIP_NO_CACHE_DIR=1

COPY . .

EXPOSE 10000

CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "10000"]
