# Engineering Lessons & Self-Correction Log

## [2026-11-26] - Validação Real no Host 100.87.104.126 e Hardening Zero-Trust

- **Erro / Falha Detectada:**
  1. `AssistentePessoal` (`/api/health`) retornava `{"ok": true, "version": "1.12.1"}`, causando falso status `degraded`.
  2. `scripts/host-scan.sh` falhou no Bash Linux com `unexpected token '>'` no regex `0\.0\.0\.0:([0-9]+)->`.
  3. `VAELoader` do ComfyUI falhou com `SafetensorError: header too large` porque `ae.safetensors` e outros modelos no host continham HTML (`<!doctype html>`) no início do arquivo, e `orchestrator.ts` aguardava o timeout de 180s em vez de falhar imediatamente.
  4. `docker-compose.host.yml` possuía senha default em texto plano para Postgres.
- **Causa Raiz:**
  1. Assunção de campo `.status` sem inspecionar o payload real do endpoint.
  2. Operador `->` literal dentro de `[[ =~ ]]` sem variável regex.
  3. Download anterior de modelos sem `-f` / validação de cabeçalho binário, somado à ausência de checagem de `status_str === "error"` no polling do ComfyUI.
  4. Falta de enforcement Zero-Trust para segredos obrigatórios.
- **Ação Corretiva Implementada:**
  1. Suporte explícito a `.ok === true` em `service-discovery.ts`, `host-scan.sh` e `test-integration.sh`.
  2. Uso de variáveis regex `re_bind` / `re_port` cobrindo `0.0.0.0` e `127.0.0.1`.
  3. Fail-fast no polling de `orchestrator.ts`, criação de `scripts/verify-models.sh` e re-download atômico verificado dos modelos no host.
  4. Remoção da senha default no Compose (`${POSTGRES_PASSWORD:?...}`), validação Zod em `skill-entry.ts` e guarda `path.relative()` em `storage-adapter.ts`.
- **Regra Preventiva (Anti-Repetição):**
  - Sempre validar scripts Bash com `bash -n` em Linux real antes de publicar.
  - Nunca assumir integridade de modelos baixados por tamanho em disco; sempre validar magic bytes (`GGUF`) ou tamanho de header JSON (`safetensors`).
  - Nunca declarar senhas default em arquivos `docker-compose*.yml`.
- **Evidência de Validação:**
  - `pnpm build`, `pnpm lint`, `pnpm test:unit`, `pnpm security:audit` e `RUN_LIVE_GENERATION=true pnpm test:integration` executados com sucesso.
