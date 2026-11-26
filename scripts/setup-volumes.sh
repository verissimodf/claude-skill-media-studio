#!/usr/bin/env bash
# =============================================================================
# setup-volumes.sh — Cria e configura volumes persistentes no host
# =============================================================================

set -euo pipefail

# Configuração - AJUSTE CONFORME SEU AMBIENTE
HOST_DATA_ROOT="${HOST_DATA_ROOT:-/mnt/data}"
SKILL_USER="${SKILL_USER:-$(whoami)}"
SKILL_GROUP="${SKILL_GROUP:-$(id -gn)}"
DOCKER_GID="${DOCKER_GID:-$(getent group docker 2>/dev/null | cut -d: -f3 || echo 999)}"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[SETUP]${NC} $*"; }
warn() { echo -e "${YELLOW}[SETUP]${NC} $*"; }
error() { echo -e "${RED}[SETUP]${NC} $*"; }

# Parse args antes da execução
while [[ $# -gt 0 ]]; do
    case "$1" in
        --root) HOST_DATA_ROOT="$2"; shift 2 ;;
        --user) SKILL_USER="$2"; shift 2 ;;
        --help)
            cat <<EOF
Uso: $0 [opções]

Opções:
  --root PATH     Raiz dos dados no host (padrão: /mnt/data)
  --user USER     Usuário dono dos volumes (padrão: usuário atual)
  --help          Esta ajuda

Variáveis de ambiente:
  HOST_DATA_ROOT  Mesmo que --root
  SKILL_USER      Mesmo que --user
  SKILL_GROUP     Grupo (padrão: grupo primário do usuário)
  DOCKER_GID      GID do grupo docker (padrão: detectado automaticamente)

Exemplo:
  sudo HOST_DATA_ROOT=/data ./scripts/setup-volumes.sh
EOF
            exit 0
            ;;
        *) error "Opção desconhecida: $1"; exit 1 ;;
    esac
done

# Volumes a criar: ["subpath"]="label:perms"
declare -A VOLUMES=(
    ["skill"]="skill:775"
    ["comfyui/models"]="comfyui-models:775"
    ["comfyui/output"]="comfyui-output:775"
    ["comfyui/input"]="comfyui-input:775"
    ["comfyui/custom_nodes"]="comfyui-custom-nodes:775"
    ["ffmpeg/temp"]="ffmpeg-temp:777"
    ["skill/assets"]="skill-assets:775"
    ["skill/gallery"]="skill-gallery:775"
    ["skill/projects"]="skill-projects:775"
    ["skill/temp"]="skill-temp:777"
)

create_volume() {
    local path="$1"
    local perms="$2"
    local full_path="${HOST_DATA_ROOT}/${path}"

    if [[ -d "$full_path" ]]; then
        log "Já existe: $full_path"
    else
        mkdir -p "$full_path"
        log "Criado: $full_path"
    fi

    chmod "$perms" "$full_path"
    chown -R "${SKILL_USER}:${SKILL_GROUP}" "$full_path" 2>/dev/null || true

    if command -v setfacl &>/dev/null; then
        setfacl -m "g:${DOCKER_GID}:rwx" "$full_path" 2>/dev/null || true
        setfacl -d -m "g:${DOCKER_GID}:rwx" "$full_path" 2>/dev/null || true
    fi
}

main() {
    log "Configurando volumes em: $HOST_DATA_ROOT"
    log "Usuário: $SKILL_USER:$SKILL_GROUP | Docker GID: $DOCKER_GID"
    echo

    mkdir -p "$HOST_DATA_ROOT"
    chown "${SKILL_USER}:${SKILL_GROUP}" "$HOST_DATA_ROOT" 2>/dev/null || true

    for sub_path in "${!VOLUMES[@]}"; do
        local perms="${VOLUMES[$sub_path]##*:}"
        create_volume "$sub_path" "$perms"
    done

    log "Espaço disponível em $HOST_DATA_ROOT:"
    df -h "$HOST_DATA_ROOT" | tail -1 | awk '{print "  Total: " $2 " | Usado: " $3 " | Livre: " $4 " (" $5 ")"}'

    for sub_path in "${!VOLUMES[@]}"; do
        touch "${HOST_DATA_ROOT}/${sub_path}/.gitkeep" 2>/dev/null || true
    done

    log "Volumes configurados com sucesso!"
    echo
    log "Para usar no docker-compose, adicione ao .env:"
    echo "  HOST_DATA_ROOT=$HOST_DATA_ROOT"
    echo
    log "E no docker-compose.yml:"
    echo "  volumes:"
    for sub_path in "${!VOLUMES[@]}"; do
        echo "    - \${HOST_DATA_ROOT}/${sub_path}:/data/${sub_path}"
    done
}

main "$@"
