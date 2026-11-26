# Arquitetura — Claude Skill Media Studio

## Visão Geral

O **Claude Skill Media Studio** segue uma arquitetura modular orientada a pipelines, desacoplando a interface da skill (`src/skill-entry.ts`) dos adaptadores de infraestrutura (`ServiceDiscovery`, `LocalStorageAdapter`, `AssistentePessoalClient` e `PipelineOrchestrator`).

## Componentes Principais

1. **Config Loader (`src/config/schema.ts`)**
   - Carrega `config/default.json`, aplica merge com `config/{NODE_ENV}.json` e sobrescreve com variáveis de ambiente.
   - Valida todo o objeto com **Zod** antes da inicialização.

2. **Service Discovery (`src/lib/service-discovery.ts`)**
   - Executa `scripts/host-scan.sh --json` em ambientes Linux/macOS para inspecionar Docker, systemd, PM2, GPU, volumes e rede.
   - Possui fallback nativo em Node.js (`scanNative()`) para probes HTTP (ComfyUI, AssistentePessoal), binários locais (FFmpeg) e volumes esperados.

3. **Local Storage Adapter (`src/lib/storage-adapter.ts`)**
   - Gerencia os diretórios persistentes `assets/`, `gallery/`, `projects/` e `temp/` sob `SKILL_DATA_PATH`.
   - Mantém um índice atômico em `.asset-index.json` (escrita via arquivo temporário + rename).
   - Valida extensões permitidas, tamanho máximo e protege contra path traversal.

4. **Pipeline Orchestrator (`src/lib/pipeline/orchestrator.ts`)**
   - **ComfyUI**: constrói workflows t2i/i2i/t2v/i2v, enfileira via `POST /prompt`, faz polling em `/history/{prompt_id}` e baixa os outputs via `/view`.
   - **FFmpeg**: concatena e normaliza vídeos (aspect ratio, resolução, `libx264`, `+faststart`) usando `execFile` sem shell interpolation.
   - **Publicação**: delega o envio multipart para o `AssistentePessoalClient`.

5. **AssistentePessoal Client (`src/lib/assistente-pessoal-client.ts`)**
   - Integra com `https://jarvis.laytech.com.br` usando Bearer token via `ASSISTENTE_PESSOAL_API_KEY`.
   - Expõe `checkHealth()`, `getContext()`, `sendNotification()` e `publishSocial()`.

## Fluxo de Dados

```
Request (CLI / SDK)
   │
   ▼
MediaStudioSkill.execute()
   ├── discover / get-status ──► ServiceDiscovery ──► host-scan.sh / HTTP probes
   ├── generate-image / video ─► PipelineOrchestrator ──► ComfyUI API ──► LocalStorageAdapter
   ├── assemble-video ─────────► PipelineOrchestrator ──► FFmpeg CLI ───► LocalStorageAdapter
   └── publish ────────────────► PipelineOrchestrator ──► AssistentePessoalClient ──► API Social
```
