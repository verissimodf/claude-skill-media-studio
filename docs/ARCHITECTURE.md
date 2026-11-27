# Arquitetura — Claude Skill Media Studio

## Visão Geral

O **Claude Skill Media Studio** segue uma arquitetura modular orientada a pipelines e governança Zero-Trust, desacoplando o entrypoint validado da skill (`src/skill-entry.ts`) dos adaptadores de infraestrutura (`ServiceDiscovery`, `LocalStorageAdapter`, `AssistentePessoalClient` e `PipelineOrchestrator`).

## Componentes Principais

1. **Skill Entry & Validação (`src/skill-entry.ts`)**
   - Expõe `MediaStudioSkill`, `handleSkillRequest` e interface CLI JSON.
   - Valida em runtime todos os parâmetros de entrada com **Zod v4** (`GenerateImageParamsSchema`, `GenerateVideoParamsSchema`, `AssembleVideoParamsSchema`, `PublishParamsSchema`), rejeitando null bytes e payloads fora de limite.

2. **Config Loader (`src/config/schema.ts`)**
   - Carrega `config/default.json`, aplica merge com `config/{NODE_ENV}.json` e sobrescreve com variáveis de ambiente.
   - Valida todo o objeto com **Zod** antes da inicialização.

3. **Service Discovery (`src/lib/service-discovery.ts` + `scripts/host-scan.sh`)**
   - Executa `scripts/host-scan.sh --json` em Linux/macOS para inspecionar Docker, systemd, PM2, GPU/VRAM, volumes e rede.
   - Possui fallback nativo em Node.js (`scanNative()`) para probes HTTP (ComfyUI `/system_stats`, AssistentePessoal `/api/health` com suporte a `ok: true`), binários locais (FFmpeg) e volumes esperados.

4. **Local Storage Adapter (`src/lib/storage-adapter.ts`)**
   - Gerencia os diretórios persistentes `assets/`, `gallery/`, `projects/` e `temp/` sob `SKILL_DATA_PATH`.
   - Mantém um índice atômico em `.asset-index.json` (escrita via arquivo temporário + rename).
   - Valida extensões permitidas, tamanho máximo e protege contra path traversal usando `path.relative()`.

5. **Pipeline Orchestrator & Workflows (`src/lib/pipeline/`)**
   - **Workflows ComfyUI (`src/lib/pipeline/workflows/`)**:
     - `flux-t2i.ts`: FLUX.1-dev/schnell GGUF (`UnetLoaderGGUF` + `DualCLIPLoader` com `device: "cpu"` + `FluxGuidance` + `ae.safetensors`).
     - `wan21-i2v.ts`: Wan 2.1 I2V 14B 720p GGUF (`UnetLoaderGGUF` + `CLIPLoader` + `CLIPVisionLoader` + `WanImageToVideo` + `VHS_VideoCombine`).
   - **Execução ComfyUI**: upload automático para `i2v` (`/upload/image`), enfileiramento via `POST /prompt`, polling em `/history/{prompt_id}` com **fail-fast** em `execution_error` e download via `/view`.
   - **FFmpeg**: concatena e normaliza vídeos (aspect ratio, resolução, `libx264`, `+faststart`) usando `execFile` sem shell interpolation.
   - **Publicação**: delega o envio multipart para o `AssistentePessoalClient`.

6. **AssistentePessoal Client (`src/lib/assistente-pessoal-client.ts`)**
   - Integra com `https://jarvis.laytech.com.br` usando Bearer token via `ASSISTENTE_PESSOAL_API_KEY`.
   - Expõe `checkHealth()`, `getContext()`, `sendNotification()` e `publishSocial()`.

## Fluxo de Dados

```
Request (CLI / SDK)
   │
   ▼
MediaStudioSkill.execute() [Zod Input Validation]
   ├── discover / get-status ──► ServiceDiscovery ──► host-scan.sh / HTTP probes
   ├── generate-image / video ─► PipelineOrchestrator ──► Workflows (FLUX / Wan2.1) ──► ComfyUI API ──► LocalStorageAdapter
   ├── assemble-video ─────────► PipelineOrchestrator ──► FFmpeg CLI (execFile) ──────► LocalStorageAdapter
   └── publish ────────────────► PipelineOrchestrator ──► AssistentePessoalClient ────► API Social
```
