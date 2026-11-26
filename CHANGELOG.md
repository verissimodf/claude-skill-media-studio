# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
