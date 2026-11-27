# Instalação Fácil — Claude Desktop, ChatGPT Desktop e OpenCode

O **Claude Skill Media Studio** inclui um servidor **MCP (Model Context Protocol)** nativo em `dist/mcp-server.js` (zero dependências extras) e um instalador multiplataforma (`scripts/install-clients.mjs`) compatível com **Windows, macOS e Linux**.

## 1. Instalação em 1 Comando (Todos os Clientes)

```bash
git clone https://github.com/verissimodf/claude-skill-media-studio.git
cd claude-skill-media-studio
pnpm install && pnpm build

# Configura automaticamente Claude Desktop, OpenCode e gera o preset do ChatGPT Desktop
pnpm install:clients
```

Para testar antes sem alterar arquivos (preview):

```bash
node scripts/install-clients.mjs --client all --dry-run
```

Opções suportadas:
- `--client all|claude|chatgpt|opencode`
- `--comfyui-url http://127.0.0.1:8188`
- `--assistente-url https://jarvis.laytech.com.br`
- `--data-path /caminho/dos/dados`

> **Segurança:** defina `ASSISTENTE_PESSOAL_API_KEY` no seu ambiente antes de rodar o instalador (nunca commite chaves em arquivos versionados). O instalador cria backup `.bak` automático antes de atualizar arquivos existentes.

---

## 2. Claude Desktop

Comando dedicado:

```bash
pnpm install:claude
```

Caminhos atualizados automaticamente:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Estrutura adicionada em `mcpServers`:

```json
{
  "mcpServers": {
    "media-studio": {
      "command": "node",
      "args": ["/caminho/absoluto/claude-skill-media-studio/dist/mcp-server.js"],
      "env": {
        "NODE_ENV": "production",
        "COMFYUI_ENDPOINT": "http://127.0.0.1:8188",
        "ASSISTENTE_PESSOAL_BASE_URL": "https://jarvis.laytech.com.br",
        "ASSISTENTE_PESSOAL_API_KEY": "",
        "SKILL_DATA_PATH": "/caminho/dos/dados"
      }
    }
  }
}
```

Reinicie o **Claude Desktop** para ativar as 10 ferramentas `media_studio_*`.

---

## 3. OpenCode

Comando dedicado:

```bash
pnpm install:opencode
```

Atualiza automaticamente `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "media-studio": {
      "type": "local",
      "command": ["node", "/caminho/absoluto/claude-skill-media-studio/dist/mcp-server.js"],
      "enabled": true,
      "environment": {
        "NODE_ENV": "production",
        "COMFYUI_ENDPOINT": "http://127.0.0.1:8188",
        "ASSISTENTE_PESSOAL_BASE_URL": "https://jarvis.laytech.com.br",
        "ASSISTENTE_PESSOAL_API_KEY": "",
        "SKILL_DATA_PATH": "/caminho/dos/dados"
      }
    }
  }
}
```

Reinicie o **OpenCode** e valide com `media_studio_get_status`.

---

## 4. ChatGPT Desktop

Comando dedicado:

```bash
pnpm install:chatgpt
```

Gera o arquivo pronto `config/clients/chatgpt-desktop.mcp.json` (ignorado pelo Git para não vazar caminhos locais/chaves). No **ChatGPT Desktop**:
1. Abra **Settings → Apps & Connectors → Developer Mode** (habilite MCP).
2. Clique em **Add MCP Server** e informe:
   - **Name**: `media-studio`
   - **Transport**: `stdio`
   - **Command**: `node`
   - **Args**: `<caminho_absoluto>/dist/mcp-server.js`
   - **Env**: `COMFYUI_ENDPOINT=http://127.0.0.1:8188`, `ASSISTENTE_PESSOAL_BASE_URL=https://jarvis.laytech.com.br`, `ASSISTENTE_PESSOAL_API_KEY=<sua_chave>`
3. Salve e teste solicitando: *"Use `media_studio_get_status` para verificar os serviços do Media Studio."*

---

## 5. Ferramentas MCP Disponíveis

| Ferramenta MCP | Ação da Skill | Descrição |
|---|---|---|
| `media_studio_discover` | `discover` | Varredura completa do host |
| `media_studio_get_status` | `get-status` | Status resumido dos serviços |
| `media_studio_generate_image` | `generate-image` | Geração `t2i`/`i2i` (FLUX / DreamShaper) |
| `media_studio_generate_video` | `generate-video` | Geração `t2v`/`i2v` (Wan 2.1) |
| `media_studio_assemble_video` | `assemble-video` | Montagem FFmpeg (Shorts/Reels) |
| `media_studio_publish` | `publish` | Publicação social via AssistentePessoal |
| `media_studio_list_assets` | `list-assets` | Listagem do índice local |
| `media_studio_get_asset` | `get-asset` | Detalhes de um asset |
| `media_studio_delete_asset` | `delete-asset` | Remoção de asset |
| `media_studio_cleanup_temp` | `cleanup-temp` | Limpeza de arquivos temporários |
