# Claude Skill Media Studio

> Skill para geração de imagens e vídeos via **ComfyUI** + montagem via **FFmpeg** + publicação social via **AssistentePessoal**

## 🎯 Visão Geral

Esta skill permite ao Claude:
- **Gerar imagens** (`t2i`, `i2i`) usando workflows ComfyUI otimizados (**FLUX.1-schnell/dev GGUF** com offload de CLIP/T5 em CPU e checkpoints **DreamShaper/SDXL**)
- **Gerar vídeos** (`t2v`, `i2v`) com **Wan 2.1 I2V 14B 720p GGUF** (`VHS_VideoCombine`), SVD, AnimateDiff e LTX
- **Montar Shorts/Reels/TikTok** com FFmpeg (escala, pad, `libx264`, `+faststart`)
- **Publicar automaticamente** no Instagram, TikTok, YouTube, Facebook e LinkedIn via **AssistentePessoal**
- **Descobrir serviços** no host automaticamente (ComfyUI, Ollama, AssistentePessoal, FFmpeg, GPU/VRAM, volumes e integridade binária de modelos)

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    CLAUDE SKILL                             │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │  Service    │  │  Storage    │  │  Pipeline          │  │
│  │  Discovery  │──│  Adapter    │──│  Orchestrator      │  │
│  └─────────────┘  └─────────────┘  └─────────┬──────────┘  │
│                                               │             │
│                    ┌──────────────────────────┼──────────┐  │
│                    ▼                          ▼          ▼  │
│             ┌─────────────┐           ┌─────────────┐ ┌─────────┐
│             │  ComfyUI    │           │  FFmpeg     │ │Assistente│
│             │  (Docker)   │           │  (Local)    │ │Pessoal  │
│             └─────────────┘           └─────────────┘ └─────────┘
│                    │                          │          │
│                    └──────────────────────────┼──────────┘
│                                               ▼
│                    ┌─────────────────────────────────────────┐
│                    │        VOLUMES PERSISTENTES (Host)      │
│                    │  /data/skill  /data/comfyui  /data/ffmpeg│
│                    └─────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

Veja mais detalhes em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 🚀 Início Rápido

### 1. Pré-requisitos

- **Node.js** `>= 26.0.0` (container oficial em `node:26-alpine`)
- **pnpm** `>= 10.0.0`
- **Docker** + **Docker Compose**, **FFmpeg/FFprobe**, **curl**, **jq**, **python3**

```bash
# Verificar requisitos do host
./scripts/verify-requirements.sh

# Validar integridade binária dos modelos ComfyUI (.safetensors / .gguf)
pnpm verify:models
```

### 2. Configurar Volumes

```bash
# Ajuste HOST_DATA_ROOT para seu ambiente (ex: /opt/laytech-ai/volumes ou /mnt/data)
sudo HOST_DATA_ROOT=/opt/laytech-ai/volumes ./scripts/setup-volumes.sh
```

### 3. Varredura do Host

```bash
# Human-readable
./scripts/host-scan.sh

# JSON para integração
./scripts/host-scan.sh --json --output scan-result.json
```

### 4. Build, Auditoria e Testes

```bash
# Instalar dependências
pnpm install

# Build TypeScript (strict) + ESLint 10 + Segurança
pnpm build
pnpm lint
pnpm security:audit

# Testes unitários e de integração
pnpm test:unit
pnpm test:integration

# Teste E2E ao vivo contra ComfyUI + AssistentePessoal reais
RUN_LIVE_GENERATION=true pnpm test:integration
```

### 5. Docker (Hardened `node:26-alpine`, non-root UID 1001)

```bash
# Build da imagem da skill
pnpm docker:build

# Subir skill integrada às redes do host (AI_INTERNAL + CNC_APP_PROD_01)
export POSTGRES_PASSWORD="sua_senha_forte_aqui"
docker compose -f docker/docker-compose.host.yml up -d
```

## 📋 Uso da Skill

### Via CLI (Teste)

```bash
# Descoberta e status
node dist/skill-entry.js '{"action":"discover","params":{}}'
node dist/skill-entry.js '{"action":"get-status","params":{}}'

# Gerar imagem com FLUX.1-schnell GGUF (4 steps, CLIP em CPU)
node dist/skill-entry.js '{
  "action":"generate-image",
  "params":{
    "prompt":"a beautiful sunset over mountains, photorealistic, 8k",
    "width":1024,"height":1024,"steps":4,"cfg":1.0,
    "model":"flux1-schnell-Q3_K_S.gguf"
  }
}'

# Gerar vídeo i2v com Wan 2.1 14B 720p GGUF
node dist/skill-entry.js '{
  "action":"generate-video",
  "params":{
    "prompt":"camera panning over ocean waves, cinematic lighting",
    "inputAssetId":"asset_123456",
    "duration":3,"fps":16,"width":832,"height":480,
    "model":"wan2.1-i2v-14b-720p-Q4_K_M.gguf"
  }
}'

# Montar Short 9:16
node dist/skill-entry.js '{
  "action":"assemble-video",
  "params":{
    "type":"shorts",
    "clips":[{"assetId":"asset_1"},{"assetId":"asset_2"}],
    "aspectRatio":"9:16","resolution":"1080x1920"
  }
}'

# Publicar nas redes sociais
node dist/skill-entry.js '{
  "action":"publish",
  "params":{
    "assetId":"asset_final",
    "platforms":["instagram","tiktok"],
    "caption":"Meu vídeo incrível! #shorts #reels"
  }
}'
```

### Via Claude Code / TypeScript

```typescript
import { handleSkillRequest } from 'claude-skill-media-studio';

const result = await handleSkillRequest({
  action: 'generate-image',
  params: {
    prompt: 'professional headshot, studio lighting',
    model: 'flux1-schnell-Q3_K_S.gguf',
    width: 1024,
    height: 1024,
    steps: 4,
  },
  context: { userId: 'user_123', projectId: 'proj_456' },
});
```

## 📚 Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Setup do Host](docs/HOST_SETUP.md)
- [Service Discovery](docs/SERVICE_DISCOVERY.md)
- [Referência da API](docs/API_REFERENCE.md)
- [Auditoria de Segurança (Zero-Trust)](docs/SECURITY_AUDIT.md)
- [Notas de Release v1.0.0](docs/RELEASE_NOTES_v1.0.0.md)
- [Lições de Engenharia](tasks/lessons.md)

## 🧪 Testes

```bash
# Unitários (Vitest 5)
pnpm test:unit

# Integração (requer ComfyUI / AssistentePessoal acessíveis)
pnpm test:integration

# Integração com geração real ao vivo no ComfyUI
RUN_LIVE_GENERATION=true pnpm test:integration

# E2E completo via script
./scripts/test-integration.sh
```

## 📄 Licença

MIT License - veja [LICENSE](LICENSE).
