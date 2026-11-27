# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-26

### Added
- Workflows reais validados em ComfyUI `0.46.2`:
  - `src/lib/pipeline/workflows/flux-t2i.ts` (**FLUX.1-dev/schnell GGUF** com `UnetLoaderGGUF`, `DualCLIPLoader` com `device: "cpu"` para economia de VRAM, `FluxGuidance` e `ae.safetensors`)
  - `src/lib/pipeline/workflows/wan21-i2v.ts` (**Wan 2.1 I2V 14B 720p GGUF** com `WanImageToVideo`, `CLIPVisionEncode` e `VHS_VideoCombine`)
- Upload automático de imagens para `i2v` (`/upload/image`) e fail-fast no polling de erros (`execution_error`) em `PipelineOrchestrator`
- Script `scripts/verify-models.sh` (`pnpm verify:models`) para auditoria de cabeçalhos binários `.safetensors` e `.gguf`
- Suite de integração real `tests/integration/host-real.integration.test.ts` com modo `RUN_LIVE_GENERATION=true`
- Relatório de auditoria de segurança `docs/SECURITY_AUDIT.md` e registro de lições `tasks/lessons.md`

### Changed
- Requisitos atualizados para **Node.js >= 26.0.0** (`node:26-alpine`, CI `NODE_VERSION: 26`) e **pnpm >= 10.0.0**
- Dependências atualizadas: `zod@4.6.7`, `axios@1.21.1`, `mime-types@3.0.2`, `eslint@10` (flat config `eslint.config.mjs`), `typescript-eslint@8`, `vitest@5.1.2`, `vite@7.3.8`, `@types/node@26`
- `docker/docker-compose.host.yml` adaptado à topologia real do host (`AI_INTERNAL`, `CNC_APP_PROD_01`, `/opt/laytech-ai/volumes/comfyui/*`, Redis em `127.0.0.1:6380` e Postgres em `127.0.0.1:5434`)
- `Dockerfile.skill` otimizado para `node:26-alpine` (instalação `pnpm@10` sem `corepack`, usuário não-root UID `1001`, `/app` somente-leitura)
- Health check do AssistentePessoal corrigido para reconhecer `{"ok": true}` como `healthy`

### Security
- Removida senha default em texto plano (`POSTGRES_PASSWORD:?`) no `docker/docker-compose.host.yml`
- Adicionados `no-new-privileges:true`, `read_only: true` e `tmpfs: [/tmp]` nos arquivos Compose
- Validação estrita de payloads com Zod em `src/skill-entry.ts` (limites de tamanho e bloqueio de null bytes)
- Proteção contra path traversal reforçada com `path.relative()` em `LocalStorageAdapter`
- Adicionado `pnpm security:audit` (`--audit-level=high`) no CI

## [1.0.0] - 2026-11-26

### Added
- Initial release
- Service Discovery para ComfyUI, AssistentePessoal, FFmpeg, Ollama, GPU, volumes
- Local Storage Adapter com volumes persistentes no host
- Pipeline Orchestrator: geração imagem (t2i/i2i), vídeo (t2v/i2v), montagem FFmpeg
- AssistentePessoal Client para orquestração, contexto, notificações, publicação social
- Docker Compose para deploy da skill e serviços de apoio no host
- Scripts de setup: `host-scan.sh`, `verify-requirements.sh`, `setup-volumes.sh`, `test-integration.sh`
- Configuração por ambiente (`default.json`, `development.json`, `production.json`) com validação Zod
- TypeScript strict mode, ESLint, Vitest, Husky e workflow de CI no GitHub Actions

### Security
- API keys via environment variables apenas
- Non-root Docker user
- Read-only docker socket mount para discovery

## [Unreleased]

### Planned
- Web UI para monitoramento
- Suporte a múltiplos ComfyUI workers
- Queue persistente (Redis/BullMQ)
- Templates de Shorts/Reels pré-definidos
- Analytics de geração
