# Release v1.0.0 — Claude Skill Media Studio

## Highlights

Primeira release estável da **Claude Skill Media Studio**, integrando geração de imagens e vídeos via **ComfyUI**, montagem programática com **FFmpeg**, descoberta automática de serviços do host e publicação social via **AssistentePessoal**.

## Novidades

### Core & Pipeline
- **Service Discovery (`scripts/host-scan.sh` + `src/lib/service-discovery.ts`)**: detecção automática de ComfyUI, AssistentePessoal, FFmpeg, Ollama, GPU (NVIDIA VRAM), volumes persistentes e rede, com cache configurável e fallback nativo em Node.js.
- **Workflows Reais ComfyUI (`src/lib/pipeline/workflows/`)**:
  - `flux-t2i.ts`: workflow **FLUX.1-dev GGUF** (`UnetLoaderGGUF` + `DualCLIPLoader` + `FluxGuidance` + `ae.safetensors`).
  - `wan21-i2v.ts`: workflow **Wan 2.1 I2V 14B 720p GGUF** (`UnetLoaderGGUF` + `CLIPLoader` + `CLIPVisionLoader` + `WanImageToVideo` + `VHS_VideoCombine`).
- **Pipeline Orchestrator (`src/lib/pipeline/orchestrator.ts`)**: enfileiramento e polling em ComfyUI com fail-fast em `execution_error`, upload de imagem para `i2v` (`/upload/image`), montagem de Shorts/Reels via FFmpeg (`execFile` seguro) e publicação social.
- **Local Storage Adapter (`src/lib/storage-adapter.ts`)**: gestão de volumes persistentes (`assets/`, `gallery/`, `projects/`, `temp/`) com índice atômico `.asset-index.json`, validação de extensões/tamanho e limpeza automática de temporários.
- **AssistentePessoal Client (`src/lib/assistente-pessoal-client.ts`)**: integração autenticada via `ASSISTENTE_PESSOAL_API_KEY` para health check, contexto, notificações e publicação multipart.

### Infraestrutura & Operações
- **Docker Compose adaptado ao host (`docker/docker-compose.host.yml`)**: conecta às redes externas `AI_INTERNAL` e `CNC_APP_PROD_01` e aos volumes reais `/opt/laytech-ai/volumes/comfyui/*`, com Redis (`127.0.0.1:6380`) e Postgres (`127.0.0.1:5434`) dedicados sem conflito de portas.
- **Scripts operacionais**: `host-scan.sh`, `verify-requirements.sh`, `setup-volumes.sh` e `test-integration.sh`.
- **CI/CD (`.github/workflows/ci.yml`)**: lint, typecheck, testes unitários, build Docker e publicação automatizada.

## Validação Real em Host (`127.0.0.1`)

- `host-scan.sh --json`: 68 serviços descobertos (68 healthy, 0 degraded, 0 unreachable), incluindo `comfyui`, `AssistentePessoal (v1.12.1)` e `ffmpeg 8.0.1`.
- `docker compose -f docker/docker-compose.host.yml config`: validado sem erros.
- Testes unitários (`9/9`) e integração contra ComfyUI + AssistentePessoal + FFmpeg validados.

## Instalação Rápida

```bash
git clone https://github.com/verissimodf/claude-skill-media-studio.git
cd claude-skill-media-studio
cp .env.example .env
pnpm install && pnpm build
./scripts/host-scan.sh --verbose
```
