# Service Discovery — Claude Skill Media Studio

## Como Funciona

O módulo de Service Discovery combina um script shell portátil (`scripts/host-scan.sh`) com um wrapper TypeScript (`src/lib/service-discovery.ts`) que oferece cache configurável (`discovery.scanIntervalMs`) e fallback nativo em Node.js.

## Serviços Detectados

| Serviço | Fontes de Detecção | Health Check |
|---------|--------------------|--------------|
| `comfyui` | Docker, systemd, PM2, HTTP fallback | `GET /system_stats` |
| `assistente-pessoal` | Docker, systemd, URL configurada | `GET /api/health` |
| `ffmpeg` | Binário no `PATH` | `ffmpeg -version` |
| `ollama` | Docker, systemd, PM2 | `GET /api/tags` |
| `database` / `redis` | Docker, systemd | Status do container/serviço |
| `gpu` | `nvidia-smi` ou `/sys/class/drm` | VRAM total/livre |
| `volumes` | `docker volume ls`, `df -h`, paths esperados | Existência e permissões |

## Uso via CLI

```bash
# Relatório legível no terminal
./scripts/host-scan.sh --verbose

# Saída JSON pura (para pipelines e integração)
./scripts/host-scan.sh --json --output scan-result.json
```

## Código de Saída

- `0`: varredura concluída sem ausência de serviços críticos (`comfyui`, `assistente-pessoal`, `ffmpeg`).
- `1`: um ou mais serviços críticos estão marcados como `unreachable`.
