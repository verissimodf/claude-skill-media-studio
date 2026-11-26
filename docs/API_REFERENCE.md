# Referência da API — Claude Skill Media Studio

## Contrato de Requisição (`SkillRequest`)

```typescript
interface SkillRequest<TParams = Record<string, unknown>> {
  action:
    | 'discover'
    | 'get-status'
    | 'generate-image'
    | 'generate-video'
    | 'assemble-video'
    | 'publish'
    | 'list-assets'
    | 'get-asset'
    | 'delete-asset'
    | 'cleanup-temp';
  params?: TParams;
  context?: {
    userId?: string;
    projectId?: string;
    correlationId?: string;
  };
}
```

## Contrato de Resposta (`SkillResponse`)

```typescript
interface SkillResponse<TData = unknown> {
  success: boolean;
  action: SkillAction;
  data?: TData;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
  durationMs: number;
}
```

## Ações Disponíveis

### `discover`
Executa varredura do host. Params: `{ force?: boolean }`.

### `get-status`
Retorna versão da skill e resumo de saúde dos serviços descobertos.

### `generate-image`
Enfileira workflow t2i/i2i no ComfyUI e salva os resultados em `gallery/`.
Params: `{ prompt, negativePrompt?, model?, width?, height?, steps?, cfg?, seed?, batchSize?, sampler?, scheduler?, workflow? }`.

### `generate-video`
Enfileira workflow t2v/i2v no ComfyUI e salva os resultados em `gallery/`.
Params: `{ prompt, negativePrompt?, model?, inputAssetId?, width?, height?, fps?, duration?, steps?, cfg?, seed?, workflow? }`.

### `assemble-video`
Concatena e formata clips locais com FFmpeg, salvando em `projects/`.
Params: `{ type?, clips: [{ assetId, startSec?, durationSec? }], aspectRatio?, resolution?, outputFilename? }`.

### `publish`
Publica um asset salvo via AssistentePessoal nas redes selecionadas.
Params: `{ assetId, platforms, caption, hashtags?, scheduledAt?, title? }`.

### `list-assets` / `get-asset` / `delete-asset` / `cleanup-temp`
Operações de gerenciamento do índice local de mídia (`.asset-index.json`).
