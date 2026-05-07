# Linux Server Quickstart (Arch)

This project is ready to run with Docker Compose from the `infra` folder.

## 1) Install Docker on Arch

```bash
sudo pacman -Syu
sudo pacman -S docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

## 2) Put project on server

```bash
git clone <your-repo-url>
cd AI_local_model
```

## 3) Prepare required files

- `backend-node/.env`
- `worker-python/.env` (optional if `.env.example` is enough)
- `secrets/gcp-sa.json` (required)

## 4) Deploy

```bash
cd infra
chmod +x deploy.sh
./deploy.sh
```

## 5) Update later

```bash
cd ~/AI_local_model
git pull
cd infra
./deploy.sh
```

## Useful commands

```bash
cd ~/AI_local_model/infra
docker compose logs -f backend
docker compose logs -f worker
docker compose ps
docker compose down
```
