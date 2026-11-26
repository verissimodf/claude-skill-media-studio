# Setup do Host — Claude Skill Media Studio

## 1. Pré-requisitos

- **Node.js** `>= 18.0.0` (recomendado Node 20 LTS)
- **pnpm** `>= 8.0.0`
- **Docker** e **Docker Compose** (plugin `docker compose`)
- **FFmpeg** e **FFprobe** no `PATH`
- **curl** e **jq** (para os scripts de varredura)
- **GPU NVIDIA + NVIDIA Container Toolkit** (recomendado para ComfyUI)

Execute a verificação automática:

```bash
chmod +x scripts/*.sh
./scripts/verify-requirements.sh
```

## 2. Volumes Persistentes

Crie a árvore de diretórios no host (padrão `/mnt/data`, customizável via `HOST_DATA_ROOT`):

```bash
sudo HOST_DATA_ROOT=/mnt/data ./scripts/setup-volumes.sh
```

Estrutura criada:

```text
/mnt/data/
├── skill/
│   ├── assets/
│   ├── gallery/
│   ├── projects/
│   └── temp/
├── comfyui/
│   ├── models/
│   ├── output/
│   ├── input/
│   └── custom_nodes/
└── ffmpeg/
    └── temp/
```

## 3. Variáveis de Ambiente

Copie `.env.example` para `.env` e ajuste:

```bash
cp .env.example .env
```

Campos essenciais:
- `HOST_DATA_ROOT`: raiz dos volumes no host (`/mnt/data` ou `/data`)
- `COMFYUI_ENDPOINT`: URL do ComfyUI (`http://localhost:8188`)
- `ASSISTENTE_PESSOAL_BASE_URL`: URL do AssistentePessoal (`https://jarvis.laytech.com.br`)
- `ASSISTENTE_PESSOAL_API_KEY`: chave de API (nunca commitar no Git)

## 4. Subindo Serviços Auxiliares (Opcional)

Se ainda não possui ComfyUI, Redis ou PostgreSQL rodando no host:

```bash
docker compose -f docker/docker-compose.host.yml up -d
```

## 5. Subindo a Skill via Docker

```bash
pnpm docker:build
pnpm docker:run
pnpm docker:logs
```
