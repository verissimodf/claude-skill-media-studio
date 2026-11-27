# Setup do Host — Claude Skill Media Studio

## 1. Pré-requisitos

- **Node.js** `>= 26.0.0` (imagem oficial `node:26-alpine` no Docker/CI)
- **pnpm** `>= 10.0.0`
- **Docker** e **Docker Compose** (plugin `docker compose`)
- **FFmpeg** e **FFprobe** no `PATH`
- **curl**, **jq** e **python3** (para scripts de varredura e verificação de modelos)
- **GPU NVIDIA + NVIDIA Container Toolkit** (recomendado para ComfyUI)

Execute as verificações automáticas:

```bash
chmod +x scripts/*.sh
./scripts/verify-requirements.sh
./scripts/verify-models.sh
```

## 2. Volumes Persistentes

No host de produção (`127.0.0.1`), os volumes do ComfyUI ficam em `/opt/laytech-ai/volumes/comfyui`. Para criar a árvore completa de volumes da skill:

```bash
sudo HOST_DATA_ROOT=/opt/laytech-ai/volumes ./scripts/setup-volumes.sh
```

Estrutura utilizada:

```text
/opt/laytech-ai/volumes/
├── skill/
│   ├── assets/
│   ├── gallery/
│   ├── projects/
│   └── temp/
├── comfyui/
│   ├── models/        # unet/*.gguf, checkpoints/*.safetensors, vae/, text_encoders/, clip_vision/
│   ├── output/
│   ├── input/
│   └── custom_nodes/
└── ffmpeg/
    └── temp/
```

## 3. Modelos Recomendados para GPU Compartilhada (RTX 3060 12 GB)

Quando a GPU é compartilhada com outros serviços (ex.: `sd-server`, `whisper-server`, `ollama`):
- **Geração rápida (`t2i`)**: `flux1-schnell-Q3_K_S.gguf` (4.85 GB, 4 steps) com `DualCLIPLoader device: "cpu"` (padrão no `flux-t2i.ts`) ou `DreamShaper_8_pruned.safetensors` (2.0 GB).
- **Geração máxima qualidade (`t2i`)**: `flux1-dev-q4_k_m.gguf` (7.06 GB, 20 steps) — recomenda-se passar `--reserve-vram 5.5` ou `--lowvram` no `CLI_ARGS` do container `comfyui`.
- **Vídeo (`i2v`)**: `wan2.1-i2v-14b-720p-Q4_K_M.gguf` + `wan_2.1_vae.safetensors` + `clip_vision_h.safetensors` + `umt5_xxl_fp8_e4m3fn_scaled.safetensors`.

Valide sempre a integridade binária após downloads:

```bash
COMFYUI_MODELS_DIR=/opt/laytech-ai/volumes/comfyui/models ./scripts/verify-models.sh
```

## 4. Variáveis de Ambiente

Copie `.env.example` para `.env` e ajuste:

```bash
cp .env.example .env
```

Campos obrigatórios (Zero-Trust — sem senhas default em texto plano):
- `HOST_DATA_ROOT`: raiz dos volumes no host (`/opt/laytech-ai/volumes`)
- `COMFYUI_ENDPOINT`: URL do ComfyUI (`http://localhost:8188` ou `http://comfyui:8188` em Docker)
- `ASSISTENTE_PESSOAL_BASE_URL`: `https://jarvis.laytech.com.br`
- `ASSISTENTE_PESSOAL_API_KEY`: chave de API (nunca commitar no Git)
- `POSTGRES_PASSWORD`: senha forte obrigatória para o `skill-postgres` no `docker-compose.host.yml`

## 5. Subindo a Skill Integrada ao Host

O arquivo `docker/docker-compose.host.yml` conecta a skill às redes externas existentes `AI_INTERNAL` (`comfyui:8188`) e `CNC_APP_PROD_01` (`assistente-pessoal`), expondo Redis dedicado em `127.0.0.1:6380` e Postgres dedicado em `127.0.0.1:5434`:

```bash
export POSTGRES_PASSWORD="sua_senha_forte_aqui"
docker compose -f docker/docker-compose.host.yml up -d
```

Caso ainda não tenha um container `comfyui` rodando no host:

```bash
docker compose -f docker/docker-compose.host.yml --profile standalone-comfyui up -d
```
