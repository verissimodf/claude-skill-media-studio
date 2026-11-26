# Claude Skill Media Studio

> Skill para geração de imagens e vídeos via **ComfyUI** + montagem via **FFmpeg** + publicação social via **AssistentePessoal**

## 🎯 Visão Geral

Esta skill permite ao Claude:
- **Gerar imagens** (t2i, i2i) usando seus workflows ComfyUI
- **Gerar vídeos** (t2v, i2v) com SVD, AnimateDiff, LTX, Wan, etc.
- **Montar Shorts/Reels/TikTok** com FFmpeg (transições, legendas, áudio)
- **Publicar automaticamente** no Instagram, TikTok, YouTube, Facebook, LinkedIn via AssistentePessoal
- **Descobrir serviços** no host automaticamente (ComfyUI, Ollama, AssistentePessoal, FFmpeg, GPU, volumes)

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

```bash
# Verificar requisitos
./scripts/verify-requirements.sh
```

### 2. Configurar Volumes

```bash
# Ajuste HOST_DATA_ROOT para seu ambiente
sudo HOST_DATA_ROOT=/mnt/data ./scripts/setup-volumes.sh

# Ou use o padrão /mnt/data
./scripts/setup-volumes.sh
```

### 3. Varredura do Host

```bash
# Human-readable
./scripts/host-scan.sh

# JSON para integração
./scripts/host-scan.sh --json --output scan-result.json
```

### 4. Build e Teste

```bash
# Instalar dependências
pnpm install

# Build TypeScript
pnpm build

# Testes
pnpm test:unit
./scripts/test-integration.sh
```

### 5. Docker (Opcional)

```bash
# Build
pnpm docker:build

# Run
pnpm docker:run

# Logs
pnpm docker:logs
```

## 📋 Uso da Skill

### Via CLI (Teste)

```bash
# Descoberta
node dist/skill-entry.js '{"action":"discover","params":{}}'

# Status resumido
node dist/skill-entry.js '{"action":"get-status","params":{}}'

# Gerar imagem
node dist/skill-entry.js '{
  "action":"generate-image",
  "params":{
    "prompt":"a beautiful sunset over mountains, photorealistic, 8k",
    "width":1024,"height":1024,"steps":25,"cfg":7,
    "model":"sd_xl_base_1.0.safetensors"
  }
}'

# Gerar vídeo
node dist/skill-entry.js '{
  "action":"generate-video",
  "params":{
    "prompt":"camera panning over ocean waves, cinematic lighting",
    "duration":4,"fps":8,"width":1024,"height":576,
    "model":"svd_xt_1_1.safetensors"
  }
}'

# Montar Short
node dist/skill-entry.js '{
  "action":"assemble-video",
  "params":{
    "type":"shorts",
    "clips":[{"assetId":"asset_1"},{"assetId":"asset_2"}],
    "aspectRatio":"9:16","resolution":"1080x1920"
  }
}'

# Publicar
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
    width: 1024,
    height: 1024,
  },
  context: { userId: 'user_123', projectId: 'proj_456' },
});
```

## 📚 Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Setup do Host](docs/HOST_SETUP.md)
- [Service Discovery](docs/SERVICE_DISCOVERY.md)
- [Referência da API](docs/API_REFERENCE.md)

## 🧪 Testes

```bash
# Unitários
pnpm test:unit

# Integração (requer serviços rodando)
pnpm test:integration

# E2E completo
./scripts/test-integration.sh
```

## 📄 Licença

MIT License - veja [LICENSE](LICENSE).
