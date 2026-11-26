# Auditoria de Segurança — Claude Skill Media Studio

Avaliação conduzida sob os protocolos **CyberSec Zero-Trust**, **Laytech Engineering Standard**, **Detection Engineering Coverage** e **ECC Context Optimizer**.

## Resumo de Achados e Remediações

| Severidade | Achado | Remediação Aplicada | Status |
|---|---|---|---|
| **Crítica** | Senha padrão em texto plano (`skill_secure_password`) no `docker/docker-compose.host.yml` | Substituído por `${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}` (Zero-Trust Rule 3) | Corrigido |
| **Alta** | `SkillRequest.params` sem validação de schema em runtime no `skill-entry.ts` | Adicionados schemas Zod estritos (`GenerateImageParamsSchema`, `GenerateVideoParamsSchema`, `AssembleVideoParamsSchema`, `PublishParamsSchema`) com limites de tamanho e bloqueio de null bytes | Corrigido |
| **Alta** | Proteção de path traversal via `startsWith()` em `LocalStorageAdapter` suscetível a prefixo irmão (`/data/skill-evil`) | Migrado para `path.relative(basePath, target)` rejeitando `..` e caminhos absolutos | Corrigido |
| **Alta** | Modelos `.safetensors` corrompidos no host (`<!doctype html>` salvo como arquivo binário de 320MB+) | Criado `scripts/verify-models.sh` para validação de cabeçalho binário `safetensors`/`GGUF` e re-download atômico com verificação pré-`mv` | Corrigido |
| **Média** | Containers Docker sem `no-new-privileges` e `read_only` | Adicionados `security_opt: ["no-new-privileges:true"]`, `read_only: true` e `tmpfs: ["/tmp"]` em `docker-compose.host.yml` e `docker-compose.skill.yml` | Corrigido |
| **Média** | `eslint@8.57.1` obsoleto e ausência de `pnpm audit` no CI | Migrado para `eslint@10` (flat config `eslint.config.mjs`), `typescript-eslint@8`, Node `26`, `pnpm@10` e adicionado `pnpm security:audit` no GitHub Actions | Corrigido |
| **Baixa** | `docker.sock` montado diretamente (`:ro`) no container da skill | Documentada migração opcional para `tecnativa/docker-socket-proxy` (já ativo no host `100.87.104.126`) | Mitigado |

## Oportunidades de Detecção (Detection Engineering)

Para monitoramento contínuo em produção (SIEM/SecOps):
1. **Anomalia de Integridade de Modelos**: alertar quando `verify-models.sh` retornar exit code `!= 0` (possível adulteração/poisoning ou falha de download).
2. **Abuso de ComfyUI / GPU DoS**: monitorar picos em `POST /prompt` com `batchSize > 4` ou `steps > 100` (já bloqueados no schema Zod).
3. **Tentativas de Path Traversal / Command Injection**: monitorar respostas `SKILL_EXECUTION_ERROR` contendo `Path traversal attempt blocked` ou falhas de validação Zod.
4. **Exposição Indevida de Portas**: garantir via `host-scan.sh` que Redis (`6380`) e Postgres (`5434`) permaneçam vinculados exclusivamente a `127.0.0.1`.

## Governança de Contexto (ECC) & Design

- Logs de varredura e testes de integração mantêm saída JSON estruturada e compacta, evitando vazamento de stdout ruidoso para a janela de contexto de agentes.
- Nota sobre `/apple-design` e `/browser`: como este repositório é uma skill CLI/SDK headless (sem interface web), as diretrizes de clareza, hierarquia visual e feedback imediato foram aplicadas aos relatórios de terminal (`host-scan.sh`, `verify-requirements.sh`) e à documentação estruturada.
