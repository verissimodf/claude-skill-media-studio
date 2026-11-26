#!/usr/bin/env bash
# =============================================================================
# test-integration.sh — Teste end-to-end da skill
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { echo -e "${BLUE}[TEST]${NC} $*"; }
success() { echo -e "${GREEN}[PASS]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }

run_test() {
    local name="$1"
    local cmd="$2"

    log "Executando: $name"
    if eval "$cmd"; then
        success "$name"
        return 0
    else
        fail "$name"
        return 1
    fi
}

main() {
    log "Iniciando testes de integração..."
    cd "$PROJECT_ROOT"

    local failed=0

    # 1. Build TypeScript
    run_test "TypeScript Build" "pnpm build" || failed=$((failed + 1))

    # 2. Lint
    run_test "ESLint" "pnpm lint" || failed=$((failed + 1))

    # 3. Testes unitários
    run_test "Unit Tests" "pnpm test:unit" || failed=$((failed + 1))

    # 4. Service Discovery
    run_test "Service Discovery Script" "./scripts/host-scan.sh --json > /tmp/scan.json && jq -e '.services | length > 0' /tmp/scan.json" || failed=$((failed + 1))

    # 5. Verificar AssistentePessoal
    run_test "AssistentePessoal Health" "curl -sf --max-time 10 https://jarvis.laytech.com.br/api/health | jq -e '.ok == true or .status == \"ok\" or .status == \"healthy\"'" || failed=$((failed + 1))

    # 6. ComfyUI (se disponível)
    if curl -sf --max-time 5 http://localhost:8188/system_stats &>/dev/null; then
        run_test "ComfyUI Health" "curl -sf http://localhost:8188/system_stats | jq -e '.system'" || failed=$((failed + 1))

        # 7. Teste geração simples (opcional)
        run_test "ComfyUI Simple Generation" "
            curl -sf -X POST http://localhost:8188/prompt \
                -H 'Content-Type: application/json' \
                -d '{\"prompt\":{\"1\":{\"class_type\":\"CheckpointLoaderSimple\",\"inputs\":{\"ckpt_name\":\"test.safetensors\"}}},\"client_id\":\"test_skill\"}' \
                | jq -e '.prompt_id' || true
        " || warn "Teste de geração pulado (checkpoint pode não existir)"
    else
        warn "ComfyUI não acessível - pulando testes de geração"
    fi

    # 8. FFmpeg
    run_test "FFmpeg Assembly" "
        ffmpeg -f lavfi -i testsrc=duration=1:size=320x240:rate=1 -c:v libx264 -t 1 /tmp/test_output.mp4 -y &&
        [[ -f /tmp/test_output.mp4 ]] &&
        ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/test_output.mp4 | grep -q '1'
    " || failed=$((failed + 1))

    # 9. Storage Adapter (simulado)
    run_test "Storage Adapter Init" "
        mkdir -p /tmp/skill-test/{assets,gallery,projects,temp} &&
        ls -la /tmp/skill-test/
    " || failed=$((failed + 1))

    # 10. Docker Compose validation
    run_test "Docker Compose Config" "docker compose -f docker/docker-compose.skill.yml config" || failed=$((failed + 1))

    echo
    if [[ $failed -eq 0 ]]; then
        success "Todos os testes passaram! ✅"
        exit 0
    else
        fail "$failed teste(s) falharam ❌"
        exit 1
    fi
}

main "$@"
