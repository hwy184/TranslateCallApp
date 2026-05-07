#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f ../secrets/gcp-sa.json ]]; then
  echo "Missing file: ../secrets/gcp-sa.json"
  echo "Place your GCP service account key at ../secrets/gcp-sa.json before deploy."
  exit 1
fi

echo "[1/3] Building and starting containers..."
docker compose up -d --build --remove-orphans

echo "[2/3] Waiting for services..."
sleep 3

echo "[3/3] Current status:"
docker compose ps

echo "Deploy completed."
