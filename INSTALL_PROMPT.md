# Prompt de Instalação — Claude Skill Media Studio

> Use este prompt ao pedir para um agente (Claude Code, Cursor, Cline, OpenCode, etc.) instalar e configurar a skill.

---

## Prompt Padrão

```text
Instale a skill **claude-skill-media-studio** (v1.1.0+) no meu ambiente local.

**Passos obrigatórios:**
1. Clone o repo: `git clone https://github.com/verissimodf/claude-skill-media-studio.git`
2. Entre na pasta: `cd claude-skill-media-studio`
3. Verifique pré-requisitos: `./scripts/verify-requirements.sh`
4. Configure volumes no host: `sudo HOST_DATA_ROOT=/opt/laytech-ai/volumes ./scripts/setup-volumes.sh`
   - Ajuste `HOST_DATA_ROOT` para seu path real (ex: `/mnt/data`, `/data`, `/opt/ai/volumes`)
5. Instale deps: `pnpm install`
6. Build: `pnpm build`
7. Teste discovery: `./scripts/host-scan.sh --json`
8. Configure FreeLLM-Local no Claude Code (se usar):
   - Endpoint: `http://127.0.0.1:8082/v1`
   - Modelos: `claude-fable-5-2`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`
9. Instale via MCP (Claude Desktop/OpenCode/ChatGPT Desktop):
   `pnpm install:clients`

**Validação final:**
- `node dist/skill-entry.js '{"action":"discover","params":{}}'` → deve listar ComfyUI, FFmpeg, AssistentePessoal
- `node dist/skill-entry.js '{"action":"generate-image","params":{"prompt":"test","model":"flux1-schnell-Q3_K_S.gguf"}}'` → deve gerar imagem

**Workflows ComfyUI disponíveis em `config/workflows/`:**
- `flux1-schnell-gguf-t2i.json` — FLUX.1-schnell 4-step GGUF (t2i)
- `wan2.1-i2v-14b-720p-gguf.json` — Wan 2.1 I2V 14B 720p (i2v)
- `svd-xt-i2v.json` — SVD-XT fallback (i2v)

**Se falhar:**
- Rode `./scripts/test-integration.sh` para diagnóstico completo
- Verifique logs: `docker compose -f docker/docker-compose.host.yml logs -f`
- Confirme GPU: `nvidia-smi` e `docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi`
```

---

## Variáveis de Ambiente Necessárias

```bash
# .env (copie de .env.example)
HOST_DATA_ROOT=/opt/laytech-ai/volumes
COMFYUI_ENDPOINT=http://127.0.0.1:8188
ASSISTENTE_PESSOAL_BASE_URL=https://jarvis.laytech.com.br
ASSISTENTE_PESSOAL_API_KEY=sua_chave_aqui
POSTGRES_PASSWORD=senha_forte_aqui
```

---

## Comandos Úteis Pós-Instalação

| Ação | Comando |
|------|---------|
| Scan completo do host | `./scripts/host-scan.sh --verbose` |
| Testes unitários | `pnpm test:unit` |
| Testes integração (mock) | `pnpm test:integration` |
| Testes integração (live GPU) | `pnpm test:integration:live` |
| Build Docker | `pnpm docker:build` |
| Subir stack completa | `docker compose -f docker/docker-compose.host.yml up -d` |
| Ver logs | `docker compose -f docker/docker-compose.host.yml logs -f` |
| Auditoria segurança | `pnpm security:audit` |
| Verificar modelos | `pnpm verify:models` |
