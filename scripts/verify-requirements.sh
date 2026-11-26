#!/usr/bin/env bash
# =============================================================================
# verify-requirements.sh — Verifica pré-requisitos para a skill
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check() {
    local name="$1"
    local cmd="$2"
    local required="${3:-true}"

    if eval "$cmd" &>/dev/null; then
        echo -e "${GREEN}✓${NC} $name"
        PASS=$((PASS + 1))
        return 0
    else
        if [[ "$required" == "true" ]]; then
            echo -e "${RED}✗${NC} $name (OBRIGATÓRIO)"
            FAIL=$((FAIL + 1))
        else
            echo -e "${YELLOW}⚠${NC} $name (opcional)"
            WARN=$((WARN + 1))
        fi
        return 0
    fi
}

check_version() {
    local name="$1"
    local cmd="$2"
    local min_version="$3"
    local version_flag="${4:---version}"

    if command -v "$(echo "$cmd" | awk '{print $1}')" &>/dev/null; then
        local version
        version=$(eval "$cmd $version_flag" 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 || echo "0.0.0")
        echo -e "${GREEN}✓${NC} $name v$version"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}✗${NC} $name (não encontrado, mínimo: $min_version)"
        FAIL=$((FAIL + 1))
    fi
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         VERIFICAÇÃO DE PRÉ-REQUISITOS - MEDIA STUDIO         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo

echo "--- Runtime ---"
check_version "Node.js" "node" "26.0.0"
check_version "pnpm" "pnpm" "10.0.0"
check_version "TypeScript" "tsc" "5.9.0"

echo
echo "--- Ferramentas de Sistema ---"
check "Docker" "docker info" true
check "Docker Compose" "docker compose version" true
check "FFmpeg" "ffmpeg -version" true
check "FFprobe" "ffprobe -version" true
check "curl" "curl --version" true
check "jq" "jq --version" true
check "git" "git --version" true

echo
echo "--- GPU / IA ---"
check "NVIDIA Driver" "nvidia-smi" false
check "NVIDIA Container Toolkit" "docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi" false

echo
echo "--- Diretórios de Dados (host) ---"
for dir in \
    "/data/skill" \
    "/data/comfyui/models" \
    "/data/comfyui/output" \
    "/data/comfyui/input" \
    "/data/ffmpeg/temp" \
    "/mnt/data/skill" \
    "/mnt/data/comfyui"; do
    if [[ -d "$dir" ]]; then
        perms=$(stat -c "%a" "$dir" 2>/dev/null || stat -f "%A" "$dir" 2>/dev/null || echo "?")
        owner=$(stat -c "%U:%G" "$dir" 2>/dev/null || stat -f "%Su:%Sg" "$dir" 2>/dev/null || echo "?")
        echo -e "${GREEN}✓${NC} $dir (perms: $perms, owner: $owner)"
        PASS=$((PASS + 1))
    else
        echo -e "${YELLOW}⚠${NC} $dir (não existe - será criado no setup)"
        WARN=$((WARN + 1))
    fi
done

echo
echo "--- Conectividade ---"
check "Internet" "ping -c 1 -W 2 8.8.8.8" true
check "AssistentePessoal API" "curl -sf --max-time 5 https://jarvis.laytech.com.br/api/health" true
check "DNS" "getent hosts google.com" true

echo
echo "--- Permissões ---"
check "Usuário no grupo docker" "groups | grep -q docker" true
check "Acesso a /var/run/docker.sock" "test -S /var/run/docker.sock && test -r /var/run/docker.sock && test -w /var/run/docker.sock" true

echo
echo "╔══════════════════════════════════════════════════════════════╗"
echo -e "║  RESUMO: ${GREEN}$PASS OK${NC} | ${YELLOW}$WARN AVISOS${NC} | ${RED}$FAIL FALHAS${NC}  ║"
echo "╚══════════════════════════════════════════════════════════════╝"

if [[ $FAIL -gt 0 ]]; then
    echo -e "${RED}❌ Falhas críticas encontradas. Corrija antes de prosseguir.${NC}"
    exit 1
elif [[ $WARN -gt 0 ]]; then
    echo -e "${YELLOW}⚠️  Avisos encontrados. A skill pode funcionar mas com limitações.${NC}"
    exit 0
else
    echo -e "${GREEN}✅ Todos os pré-requisitos atendidos!${NC}"
    exit 0
fi
