#!/usr/bin/env bash
# =============================================================================
# host-scan.sh — Varredura completa do host para descoberta de serviços
# Compatível com: Linux (systemd, Docker, Podman), macOS (launchd, Docker)
# Uso: ./scripts/host-scan.sh [--json] [--verbose] [--output FILE]
# =============================================================================

set -euo pipefail

# --- Configuração ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_FORMAT="human"
VERBOSE=false
OUTPUT_FILE=""
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
START_MS=$(date +%s%3N 2>/dev/null || echo 0)
HOSTNAME=$(hostname)
USER_NAME=$(whoami)

# --- Cores ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# --- Helpers ---
log() { [[ "$OUTPUT_FORMAT" != "json" ]] && echo -e "${BLUE}[INFO]${NC} $*" >&2 || true; }
warn() { [[ "$OUTPUT_FORMAT" != "json" ]] && echo -e "${YELLOW}[WARN]${NC} $*" >&2 || true; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
success() { [[ "$OUTPUT_FORMAT" != "json" ]] && echo -e "${GREEN}[OK]${NC} $*" >&2 || true; }
verbose() { [[ "$VERBOSE" == true && "$OUTPUT_FORMAT" != "json" ]] && echo -e "${CYAN}[DEBUG]${NC} $*" >&2 || true; }

# --- Parse Args ---
while [[ $# -gt 0 ]]; do
    case $1 in
        --json) OUTPUT_FORMAT="json"; shift ;;
        --verbose) VERBOSE=true; shift ;;
        --output) OUTPUT_FILE="$2"; shift 2 ;;
        --help)
            cat <<EOF
Uso: $0 [opções]

Opções:
  --json          Saída em JSON (padrão: human-readable)
  --verbose       Log detalhado
  --output FILE   Salvar saída em arquivo
  --help          Esta ajuda

Exemplos:
  $0 --json --output scan-result.json
  $0 --verbose
EOF
            exit 0
            ;;
        *) error "Opção desconhecida: $1"; exit 1 ;;
    esac
done

# --- Estrutura de Dados ---
declare -A SERVICES=()
declare -A VOLUMES=()
declare -A NETWORK_INFO=()

# =============================================================================
# DESCOBERTA DE SERVIÇOS
# =============================================================================

discover_docker() {
    verbose "Verificando Docker..."
    if ! command -v docker &>/dev/null; then
        warn "Docker não instalado"
        return
    fi

    if ! docker info &>/dev/null; then
        warn "Docker daemon não acessível (precisa de sudo ou grupo docker)"
        return
    fi

    local containers count=0
    containers=$(docker ps --format '{{json .}}' 2>/dev/null || true)

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        count=$((count + 1))
        local id name image status ports labels networks
        id=$(echo "$line" | jq -r '.ID // ""')
        name=$(echo "$line" | jq -r '.Names // ""')
        image=$(echo "$line" | jq -r '.Image // ""')
        status=$(echo "$line" | jq -r '.State // ""')
        ports=$(echo "$line" | jq -r '.Ports // ""')
        labels=$(echo "$line" | jq -r '.Labels // ""')
        networks=$(echo "$line" | jq -r '.Networks // ""')

        local type="unknown"
        local capabilities=()
        local health="healthy"
        local endpoint=""
        local health_endpoint=""

        local lc_name="${name,,}"
        local lc_image="${image,,}"
        local lc_labels="${labels,,}"

        if [[ "$lc_name" =~ comfyui ]] || [[ "$lc_image" =~ comfyui ]] || [[ "$lc_labels" =~ comfyui ]]; then
            type="comfyui"
            capabilities=("t2i" "i2i" "t2v" "i2v" "controlnet" "lora" "upscale" "inpainting")
            health_endpoint="/system_stats"
        elif [[ "$lc_name" =~ ollama ]] || [[ "$lc_image" =~ ollama ]]; then
            type="ollama"
            capabilities=("llm" "embeddings" "chat")
            health_endpoint="/api/tags"
        elif [[ "$lc_name" =~ assistente ]] || [[ "$lc_name" =~ personal.*assistant ]] || [[ "$lc_labels" =~ assistente ]]; then
            type="assistente-pessoal"
            capabilities=("orchestration" "scheduling" "context" "notifications" "webhooks" "social-media")
            health_endpoint="/api/health"
        elif [[ "$lc_image" =~ postgres ]] || [[ "$lc_name" =~ postgres ]]; then
            type="database"
            capabilities=("postgresql" "persistent-storage")
        elif [[ "$lc_image" =~ redis ]] || [[ "$lc_name" =~ redis ]]; then
            type="redis"
            capabilities=("cache" "pubsub" "queue")
        elif [[ "$lc_image" =~ nginx ]] || [[ "$lc_image" =~ traefik ]] || [[ "$lc_name" =~ proxy ]]; then
            type="reverse-proxy"
            capabilities=("load-balancing" "ssl-termination" "routing")
        fi

        local main_port=""
        if [[ "$ports" =~ 0\.0\.0\.0:([0-9]+)-> ]]; then
            main_port="${BASH_REMATCH[1]}"
        elif [[ "$ports" =~ ([0-9]+)->([0-9]+) ]]; then
            main_port="${BASH_REMATCH[1]}"
        fi

        if [[ -n "$main_port" ]]; then
            endpoint="http://localhost:${main_port}"
            [[ -n "$health_endpoint" ]] && health_endpoint="${endpoint}${health_endpoint}"
        else
            endpoint="docker-internal"
        fi

        [[ "$status" != "running" ]] && health="degraded"

        local caps_json="[]"
        if [[ ${#capabilities[@]} -gt 0 ]]; then
            caps_json=$(printf '%s\n' "${capabilities[@]}" | jq -R . | jq -s .)
        fi

        SERVICES["docker-${id:0:12}"]=$(jq -n \
            --arg id "docker-${id:0:12}" \
            --arg type "$type" \
            --arg name "$name" \
            --arg endpoint "$endpoint" \
            --arg health_endpoint "$health_endpoint" \
            --argjson capabilities "$caps_json" \
            --arg health "$health" \
            --arg image "$image" \
            --arg ports "$ports" \
            --arg labels "$labels" \
            --arg networks "$networks" \
            --arg timestamp "$TIMESTAMP" \
            '{
                id: $id, type: $type, name: $name, endpoint: $endpoint,
                healthEndpoint: $health_endpoint, capabilities: $capabilities,
                status: $health, metadata: {image: $image, ports: $ports, labels: $labels, networks: $networks},
                discoveredAt: $timestamp
            }')
    done <<< "$containers"

    NETWORK_INFO["docker_networks"]=$(docker network ls --format '{{.Name}}' 2>/dev/null | jq -R . | jq -s . || echo '[]')
    success "Docker: $count containers encontrados"
}

discover_podman() {
    verbose "Verificando Podman..."
    if ! command -v podman &>/dev/null; then return; fi
    local containers
    containers=$(podman ps --format '{{json .}}' 2>/dev/null || true)
    [[ -z "$containers" ]] && return
    verbose "Podman containers detectados"
}

discover_systemd() {
    verbose "Verificando systemd services..."
    if ! command -v systemctl &>/dev/null; then return; fi

    local known_services=("comfyui" "ollama" "assistente" "personal-assistant" "postgresql" "redis" "nginx" "traefik" "caddy")

    for svc in "${known_services[@]}"; do
        if systemctl is-active --quiet "$svc" 2>/dev/null || systemctl list-units --type=service --state=running 2>/dev/null | grep -q "$svc"; then
            local unit_name
            unit_name=$(systemctl list-units --type=service --state=running --no-legend 2>/dev/null | grep "$svc" | awk '{print $1}' | head -1 || true)
            [[ -z "$unit_name" ]] && unit_name="$svc"

            local port=""
            if command -v ss &>/dev/null; then
                port=$(ss -tlnp 2>/dev/null | grep "$unit_name" | head -1 | grep -oE ':[0-9]+' | head -1 | tr -d ':' || true)
            fi

            local type="unknown"
            local capabilities=()
            case "$svc" in
                comfyui) type="comfyui"; capabilities=("t2i" "i2i" "t2v" "i2v" "controlnet" "lora") ;;
                ollama) type="ollama"; capabilities=("llm" "embeddings") ;;
                assistente|personal-assistant) type="assistente-pessoal"; capabilities=("orchestration" "scheduling" "context" "webhooks") ;;
                postgresql) type="database"; capabilities=("postgresql") ;;
                redis) type="redis"; capabilities=("cache" "queue") ;;
                nginx|traefik|caddy) type="reverse-proxy"; capabilities=("proxy" "ssl") ;;
            esac

            local endpoint="local"
            [[ -n "$port" ]] && endpoint="http://localhost:${port}"

            local caps_json="[]"
            if [[ ${#capabilities[@]} -gt 0 ]]; then
                caps_json=$(printf '%s\n' "${capabilities[@]}" | jq -R . | jq -s .)
            fi

            SERVICES["systemd-${svc}"]=$(jq -n \
                --arg id "systemd-${svc}" \
                --arg type "$type" \
                --arg name "$unit_name" \
                --arg endpoint "$endpoint" \
                --argjson capabilities "$caps_json" \
                --arg health "healthy" \
                --arg unit "$unit_name" \
                --arg timestamp "$TIMESTAMP" \
                '{id: $id, type: $type, name: $name, endpoint: $endpoint, capabilities: $capabilities, status: $health, metadata: {systemdUnit: $unit}, discoveredAt: $timestamp}')
        fi
    done
}

discover_pm2() {
    verbose "Verificando PM2 processes..."
    if ! command -v pm2 &>/dev/null; then return; fi

    local pm2_list
    pm2_list=$(pm2 jlist 2>/dev/null || echo "[]")

    while IFS= read -r proc; do
        [[ -z "$proc" ]] && continue
        local name pid status port
        name=$(echo "$proc" | jq -r '.name // ""')
        pid=$(echo "$proc" | jq -r '.pid // ""')
        status=$(echo "$proc" | jq -r '.pm2_env.status // ""')
        port=$(echo "$proc" | jq -r '.pm2_env.PORT // ""')

        local type="unknown"
        local capabilities=()
        local lc_name="${name,,}"

        if [[ "$lc_name" =~ comfyui ]]; then type="comfyui"; capabilities=("t2i" "i2i" "t2v" "i2v")
        elif [[ "$lc_name" =~ ollama ]]; then type="ollama"; capabilities=("llm")
        elif [[ "$lc_name" =~ assistente ]]; then type="assistente-pessoal"; capabilities=("orchestration")
        fi

        local endpoint="local"
        [[ -n "$port" && "$port" != "null" ]] && endpoint="http://localhost:${port}"

        local caps_json="[]"
        if [[ ${#capabilities[@]} -gt 0 ]]; then
            caps_json=$(printf '%s\n' "${capabilities[@]}" | jq -R . | jq -s .)
        fi

        SERVICES["pm2-${pid}"]=$(jq -n \
            --arg id "pm2-${pid}" \
            --arg type "$type" \
            --arg name "$name" \
            --arg endpoint "$endpoint" \
            --argjson capabilities "$caps_json" \
            --arg health "$([ "$status" = "online" ] && echo "healthy" || echo "degraded")" \
            --argjson pm2_env "$(echo "$proc" | jq '.pm2_env // {}')" \
            --arg timestamp "$TIMESTAMP" \
            '{id: $id, type: $type, name: $name, endpoint: $endpoint, capabilities: $capabilities, status: $health, metadata: {pm2: $pm2_env}, discoveredAt: $timestamp}')
    done < <(echo "$pm2_list" | jq -c '.[]' 2>/dev/null || true)
}

discover_binaries() {
    verbose "Verificando binários essenciais..."
    local binaries=(
        "ffmpeg:ffmpeg -version:video-assembly,transcode,thumbnail,concat"
        "ffprobe:ffprobe -version:media-analysis"
        "nvidia-smi:nvidia-smi --query-gpu=name --format=csv,noheader:gpu-monitoring"
        "docker:docker --version:container-runtime"
        "git:git --version:version-control"
        "node:node --version:javascript-runtime"
        "pnpm:pnpm --version:package-manager"
        "python3:python3 --version:python-runtime"
    )

    for entry in "${binaries[@]}"; do
        local bin="${entry%%:*}"
        local rest="${entry#*:}"
        local version_cmd="${rest%%:*}"
        local caps="${rest#*:}"
        local svc_type="binary"
        [[ "$bin" == "ffmpeg" ]] && svc_type="ffmpeg"

        if command -v "$bin" &>/dev/null; then
            local version
            version=$(eval "$version_cmd" 2>/dev/null | head -1 || echo "unknown")
            SERVICES["binary-${bin}"]=$(jq -n \
                --arg id "binary-${bin}" \
                --arg type "$svc_type" \
                --arg name "$bin" \
                --arg endpoint "local-binary" \
                --argjson capabilities "$(echo "$caps" | tr ',' '\n' | jq -R . | jq -s .)" \
                --arg health "healthy" \
                --arg version "$version" \
                --arg timestamp "$TIMESTAMP" \
                '{id: $id, type: $type, name: $name, endpoint: $endpoint, capabilities: $capabilities, status: $health, metadata: {version: $version}, discoveredAt: $timestamp}')
            success "Binário: $bin ($version)"
        else
            SERVICES["binary-${bin}"]=$(jq -n \
                --arg id "binary-${bin}" \
                --arg type "$svc_type" \
                --arg name "$bin" \
                --arg endpoint "missing" \
                --argjson capabilities "[]" \
                --arg health "unreachable" \
                --arg timestamp "$TIMESTAMP" \
                '{id: $id, type: $type, name: $name, endpoint: $endpoint, capabilities: $capabilities, status: $health, metadata: {}, discoveredAt: $timestamp}')
            warn "Binário ausente: $bin"
        fi
    done
}

discover_gpu() {
    verbose "Verificando GPU..."
    if command -v nvidia-smi &>/dev/null; then
        local gpu_info
        gpu_info=$(nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv,noheader,nounits 2>/dev/null || true)
        if [[ -n "$gpu_info" ]]; then
            NETWORK_INFO["gpu"]=$(echo "$gpu_info" | while IFS=',' read -r name total free driver; do
                jq -n \
                    --arg name "$(echo "$name" | xargs)" \
                    --arg total "$(echo "$total" | xargs)" \
                    --arg free "$(echo "$free" | xargs)" \
                    --arg driver "$(echo "$driver" | xargs)" \
                    '{name: $name, memoryTotalMB: ($total | tonumber? // 0), memoryFreeMB: ($free | tonumber? // 0), driverVersion: $driver}'
            done | jq -s .)
            success "GPU detectada: $(echo "$gpu_info" | head -1 | cut -d',' -f1)"
        fi
    elif [[ -d /sys/class/drm ]]; then
        local integrated=()
        for card in /sys/class/drm/card*/device; do
            [[ -f "$card/uevent" ]] || continue
            local vendor
            vendor=$(grep DRIVER "$card/uevent" 2>/dev/null | cut -d= -f2 || true)
            if [[ "$vendor" =~ amdgpu|i915 ]]; then
                integrated+=("$(jq -n --arg vendor "$vendor" '{vendor: $vendor, type: "integrated"}')")
            fi
        done
        if [[ ${#integrated[@]} -gt 0 ]]; then
            NETWORK_INFO["gpu"]=$(printf '%s\n' "${integrated[@]}" | jq -s .)
        fi
    fi
}

# =============================================================================
# VOLUMES E ARMAZENAMENTO
# =============================================================================

discover_volumes() {
    verbose "Descobrindo volumes e pontos de montagem..."

    if command -v docker &>/dev/null && docker info &>/dev/null; then
        local dv
        dv=$(docker volume ls --format '{{json .}}' 2>/dev/null || true)
        while IFS= read -r line; do
            [[ -z "$line" ]] && continue
            local name driver mountpoint
            name=$(echo "$line" | jq -r '.Name // ""')
            driver=$(echo "$line" | jq -r '.Driver // ""')
            mountpoint=$(docker volume inspect "$name" --format '{{.Mountpoint}}' 2>/dev/null || echo "")
            VOLUMES["docker-$name"]=$(jq -n \
                --arg name "$name" --arg driver "$driver" --arg mountpoint "$mountpoint" \
                --arg timestamp "$TIMESTAMP" \
                '{name: $name, type: "docker", driver: $driver, mountpoint: $mountpoint, discoveredAt: $timestamp}')
        done <<< "$dv"
    fi

    local df_output
    df_output=$(df -h --output=source,target,fstype,size,used,avail,pcent 2>/dev/null | tail -n +2 || true)
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        local src target fstype size used avail pcent
        read -r src target fstype size used avail pcent <<< "$line"
        [[ -z "$target" ]] && continue
        VOLUMES["host-$(echo "$target" | sed 's|/|-|g')"]=$(jq -n \
            --arg source "$src" --arg target "$target" --arg fstype "$fstype" \
            --arg size "$size" --arg used "$used" --arg avail "$avail" --arg pcent "$pcent" \
            --arg timestamp "$TIMESTAMP" \
            '{source: $source, target: $target, fstype: $fstype, size: $size, used: $used, available: $avail, usagePercent: $pcent, type: "host", discoveredAt: $timestamp}')
    done <<< "$df_output"

    local expected_paths=(
        "/data/skill:skill-data"
        "/data/comfyui/models:comfyui-models"
        "/data/comfyui/output:comfyui-output"
        "/data/comfyui/input:comfyui-input"
        "/data/ffmpeg/temp:ffmpeg-temp"
        "/mnt/data/skill:skill-data-mnt"
        "/mnt/data/comfyui:comfyui-mnt"
    )

    for entry in "${expected_paths[@]}"; do
        local path="${entry%%:*}"
        local label="${entry#*:}"
        if [[ -d "$path" ]]; then
            local perms space
            perms=$(stat -c "%a %U:%G" "$path" 2>/dev/null || stat -f "%A %u:%g" "$path" 2>/dev/null || echo "unknown")
            space=$(df -h "$path" --output=avail 2>/dev/null | tail -1 | xargs || echo "?")
            VOLUMES["expected-$label"]=$(jq -n \
                --arg path "$path" --arg label "$label" --arg perms "$perms" --arg space "$space" \
                --arg timestamp "$TIMESTAMP" \
                '{path: $path, label: $label, exists: true, permissions: $perms, availableSpace: $space, type: "expected", discoveredAt: $timestamp}')
            success "Volume esperado: $path ($label) - OK"
        else
            VOLUMES["expected-$label"]=$(jq -n \
                --arg path "$path" --arg label "$label" \
                --arg timestamp "$TIMESTAMP" \
                '{path: $path, label: $label, exists: false, type: "expected", discoveredAt: $timestamp}')
            warn "Volume esperado NÃO EXISTE: $path ($label)"
        fi
    done
}

# =============================================================================
# REDE E CONECTIVIDADE
# =============================================================================

discover_network() {
    verbose "Descobrindo rede e portas..."

    if command -v ss &>/dev/null; then
        NETWORK_INFO["listening_ports"]=$(ss -tln 2>/dev/null | grep LISTEN | awk '{print $4}' | sed 's/.*://' | sort -nu | jq -R . | jq -s . || echo '[]')
    elif command -v netstat &>/dev/null; then
        NETWORK_INFO["listening_ports"]=$(netstat -tln 2>/dev/null | grep LISTEN | awk '{print $4}' | sed 's/.*://' | sort -nu | jq -R . | jq -s . || echo '[]')
    else
        NETWORK_INFO["listening_ports"]='[]'
    fi

    if command -v ip &>/dev/null; then
        NETWORK_INFO["interfaces"]=$(ip -j addr show 2>/dev/null | jq '[.[] | {name: .ifname, ipv4: [.addr_info[] | select(.family=="inet") | .local], ipv6: [.addr_info[] | select(.family=="inet6") | .local]}]' || echo '[]')
    else
        NETWORK_INFO["interfaces"]='[]'
    fi

    if ping -c 1 -W 2 8.8.8.8 &>/dev/null; then
        NETWORK_INFO["internet"]='"reachable"'
    else
        NETWORK_INFO["internet"]='"unreachable"'
    fi

    NETWORK_INFO["dns"]=$(grep '^nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}' | jq -R . | jq -s . || echo '[]')
}

# =============================================================================
# HEALTH CHECKS ESPECÍFICOS
# =============================================================================

check_assistente_pessoal() {
    local base_url="${ASSISTENTE_PESSOAL_BASE_URL:-https://jarvis.laytech.com.br}"
    local url="${base_url%/}/api/health"
    verbose "Verificando AssistentePessoal em $url..."
    local response
    response=$(curl -s -f --max-time 10 "$url" 2>/dev/null || echo "")

    if [[ -n "$response" ]] && echo "$response" | jq . &>/dev/null; then
        local status version health
        status=$(echo "$response" | jq -r '.status // "unknown"')
        version=$(echo "$response" | jq -r '.version // "unknown"')
        health=$([[ "$status" == "ok" || "$status" == "healthy" ]] && echo "healthy" || echo "degraded")

        SERVICES["assistente-pessoal-jarvis"]=$(jq -n \
            --arg id "assistente-pessoal-jarvis" \
            --arg type "assistente-pessoal" \
            --arg name "AssistentePessoal (${base_url})" \
            --arg endpoint "$base_url" \
            --arg health_endpoint "$url" \
            --argjson capabilities '["orchestration","scheduling","context","notifications","webhooks","social-media","api-gateway"]' \
            --arg health "$health" \
            --arg status "$status" \
            --arg version "$version" \
            --argjson response "$response" \
            --arg timestamp "$TIMESTAMP" \
            '{id: $id, type: $type, name: $name, endpoint: $endpoint, healthEndpoint: $health_endpoint, capabilities: $capabilities, status: $health, metadata: {status: $status, version: $version, response: $response}, discoveredAt: $timestamp}')

        success "AssistentePessoal: $status (v$version)"
    else
        warn "AssistentePessoal não acessível em $url"
        SERVICES["assistente-pessoal-jarvis"]=$(jq -n \
            --arg id "assistente-pessoal-jarvis" \
            --arg type "assistente-pessoal" \
            --arg name "AssistentePessoal (${base_url})" \
            --arg endpoint "$base_url" \
            --arg health_endpoint "$url" \
            --argjson capabilities '[]' \
            --arg health "unreachable" \
            --arg timestamp "$TIMESTAMP" \
            '{id: $id, type: $type, name: $name, endpoint: $endpoint, healthEndpoint: $health_endpoint, capabilities: $capabilities, status: $health, metadata: {}, discoveredAt: $timestamp}')
    fi
}

check_comfyui_health() {
    verbose "Verificando saúde do ComfyUI..."
    local found_comfyui=false
    for key in "${!SERVICES[@]}"; do
        local svc_json="${SERVICES[$key]}"
        local type endpoint health_ep
        type=$(echo "$svc_json" | jq -r '.type')
        endpoint=$(echo "$svc_json" | jq -r '.endpoint')
        health_ep=$(echo "$svc_json" | jq -r '.healthEndpoint // ""')

        if [[ "$type" == "comfyui" && "$endpoint" != "docker-internal" && "$endpoint" != "local" ]]; then
            found_comfyui=true
            local url="${health_ep:-${endpoint}/system_stats}"
            local response
            response=$(curl -s -f --max-time 5 "$url" 2>/dev/null || echo "")

            if [[ -n "$response" ]] && echo "$response" | jq . &>/dev/null; then
                SERVICES[$key]=$(echo "$svc_json" | jq --argjson meta "$response" '.metadata.healthCheck = $meta | .status = "healthy"')
                success "ComfyUI health check OK: $endpoint"
            else
                SERVICES[$key]=$(echo "$svc_json" | jq '.status = "degraded"')
                warn "ComfyUI health check FALHOU: $endpoint"
            fi
        fi
    done

    if [[ "$found_comfyui" == false ]]; then
        local default_ep="${COMFYUI_ENDPOINT:-http://localhost:8188}"
        local response
        response=$(curl -s -f --max-time 5 "${default_ep%/}/system_stats" 2>/dev/null || echo "")
        if [[ -n "$response" ]] && echo "$response" | jq . &>/dev/null; then
            SERVICES["http-comfyui"]=$(jq -n \
                --arg id "http-comfyui" \
                --arg type "comfyui" \
                --arg name "ComfyUI (HTTP)" \
                --arg endpoint "$default_ep" \
                --arg health_endpoint "${default_ep%/}/system_stats" \
                --argjson capabilities '["t2i","i2i","t2v","i2v","controlnet","lora","upscale","inpainting"]' \
                --argjson meta "$response" \
                --arg timestamp "$TIMESTAMP" \
                '{id: $id, type: $type, name: $name, endpoint: $endpoint, healthEndpoint: $health_endpoint, capabilities: $capabilities, status: "healthy", metadata: {healthCheck: $meta}, discoveredAt: $timestamp}')
            success "ComfyUI detectado via HTTP: $default_ep"
        fi
    fi
}

# =============================================================================
# EXECUÇÃO PRINCIPAL
# =============================================================================

main() {
    log "Iniciando varredura do host: $HOSTNAME (usuário: $USER_NAME)"
    log "Timestamp: $TIMESTAMP"

    discover_docker
    discover_podman
    discover_systemd
    discover_pm2
    discover_binaries
    discover_gpu
    discover_volumes
    discover_network
    check_assistente_pessoal
    check_comfyui_health

    local end_ms duration_ms
    end_ms=$(date +%s%3N 2>/dev/null || echo 0)
    duration_ms=$(( end_ms >= START_MS ? end_ms - START_MS : 0 ))

    local services_json="[]"
    if [[ ${#SERVICES[@]} -gt 0 ]]; then
        services_json=$(printf '%s\n' "${SERVICES[@]}" | jq -s .)
    fi

    local volumes_json="[]"
    if [[ ${#VOLUMES[@]} -gt 0 ]]; then
        volumes_json=$(printf '%s\n' "${VOLUMES[@]}" | jq -s .)
    fi

    local network_json="{}"
    for k in "${!NETWORK_INFO[@]}"; do
        network_json=$(echo "$network_json" | jq --arg key "$k" --argjson val "${NETWORK_INFO[$k]}" '.[$key] = $val')
    done

    local result
    result=$(jq -n \
        --arg hostname "$HOSTNAME" \
        --arg user "$USER_NAME" \
        --arg timestamp "$TIMESTAMP" \
        --argjson duration "$duration_ms" \
        --argjson services "$services_json" \
        --argjson volumes "$volumes_json" \
        --argjson network "$network_json" \
        '{
            hostname: $hostname,
            user: $user,
            scannedAt: $timestamp,
            scanDurationMs: $duration,
            services: $services,
            volumes: $volumes,
            network: $network,
            summary: {
                totalServices: ($services | length),
                healthyServices: ($services | map(select(.status=="healthy")) | length),
                degradedServices: ($services | map(select(.status=="degraded")) | length),
                unreachableServices: ($services | map(select(.status=="unreachable")) | length),
                totalVolumes: ($volumes | length),
                expectedVolumesExist: ($volumes | map(select(.type=="expected" and .exists==true)) | length),
                expectedVolumesMissing: ($volumes | map(select(.type=="expected" and .exists==false)) | length)
            }
        }')

    if [[ "$OUTPUT_FORMAT" == "json" ]]; then
        echo "$result" | jq .
    else
        print_human_readable "$result"
    fi

    if [[ -n "$OUTPUT_FILE" ]]; then
        echo "$result" | jq . > "$OUTPUT_FILE"
        success "Resultado salvo em: $OUTPUT_FILE"
    fi

    local critical_missing=0
    for key in "${!SERVICES[@]}"; do
        local svc="${SERVICES[$key]}"
        local type status
        type=$(echo "$svc" | jq -r '.type')
        status=$(echo "$svc" | jq -r '.status')
        if [[ "$type" =~ ^(comfyui|assistente-pessoal|ffmpeg)$ && "$status" == "unreachable" ]]; then
            critical_missing=$((critical_missing + 1))
        fi
    done

    if [[ $critical_missing -gt 0 ]]; then
        error "Serviços críticos ausentes: $critical_missing"
        exit 1
    fi

    success "Varredura concluída com sucesso"
}

print_human_readable() {
    local json="$1"
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                    HOST SCAN REPORT - $(date)                    ║"
    echo "╠══════════════════════════════════════════════════════════════════════════════╣"
    echo "║ Host: $(echo "$json" | jq -r '.hostname') | User: $(echo "$json" | jq -r '.user') | Scan: $(echo "$json" | jq -r '.scannedAt') ║"
    echo "╠══════════════════════════════════════════════════════════════════════════════╣"

    echo "║ SERVIÇOS DESCOBERTOS ($(echo "$json" | jq -r '.summary.totalServices')) ║"
    echo "$json" | jq -r '.services[] | "[\(.status | ascii_upcase)] \(.type) | \(.name) | \(.endpoint) | \(.capabilities | join(", "))"' | while IFS= read -r line; do
        local status rest
        status=$(echo "$line" | cut -d']' -f1 | tr -d '[')
        rest=$(echo "$line" | cut -d']' -f2-)
        case "$status" in
            HEALTHY) echo -e "║  ${GREEN}✓${NC} $rest ║" ;;
            DEGRADED) echo -e "║  ${YELLOW}⚠${NC} $rest ║" ;;
            UNREACHABLE) echo -e "║  ${RED}✗${NC} $rest ║" ;;
            *) echo -e "║  ${CYAN}?${NC} $rest ║" ;;
        esac
    done

    echo "╠══════════════════════════════════════════════════════════════════════════════╣"
    echo "║ VOLUMES ($(echo "$json" | jq -r '.summary.totalVolumes')) | Esperados OK: $(echo "$json" | jq -r '.summary.expectedVolumesExist') | Faltando: $(echo "$json" | jq -r '.summary.expectedVolumesMissing') ║"
    echo "$json" | jq -r '.volumes[] | select(.type=="expected") | "[\(if .exists then "OK" else "MISSING" end)] \(.label) -> \(.path)"' | while IFS= read -r line; do
        echo "║  $line ║"
    done

    echo "╠══════════════════════════════════════════════════════════════════════════════╣"
    echo "║ REDE ║"
    echo "$json" | jq -r '.network.listening_ports[]? | "║  Porta: \(.) ║"'
    echo "$json" | jq -r '.network.internet | "║  Internet: \(.) ║"'
    if [[ -n $(echo "$json" | jq -r '.network.gpu // empty') ]]; then
        echo "$json" | jq -r '.network.gpu[] | "║  GPU: \(.name // .vendor) | VRAM: \(.memoryTotalMB // "?")MB total / \(.memoryFreeMB // "?")MB livre ║"'
    fi

    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
}

main "$@"
