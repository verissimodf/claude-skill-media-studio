#!/usr/bin/env bash
# =============================================================================
# verify-models.sh — Valida integridade binária de modelos ComfyUI (.safetensors / .gguf)
# Detecta arquivos corrompidos ou páginas HTML salvas por download falho
# =============================================================================

set -euo pipefail

MODELS_DIR="${COMFYUI_MODELS_DIR:-/opt/laytech-ai/volumes/comfyui/models}"

if [[ ! -d "$MODELS_DIR" ]]; then
    echo "[ERROR] Diretório de modelos não encontrado: $MODELS_DIR" >&2
    exit 1
fi

python3 - "$MODELS_DIR" <<'PY'
import glob, json, os, struct, sys

root = sys.argv[1]
failed = 0

print(f"Auditando modelos em: {root}")

for path in sorted(glob.glob(os.path.join(root, "**", "*.safetensors"), recursive=True)):
    try:
        with open(path, "rb") as f:
            raw = f.read(8)
            if len(raw) < 8:
                raise ValueError("arquivo truncado (<8 bytes)")
            n = struct.unpack("<Q", raw)[0]
            if n > 100_000_000:
                raise ValueError(f"header inválido (size={n}, possível HTML/corrupção)")
            hdr = json.loads(f.read(n).decode("utf-8"))
            print(f"[OK] safetensors ({len(hdr)} tensores): {os.path.relpath(path, root)}")
    except Exception as exc:
        print(f"[FAIL] safetensors: {os.path.relpath(path, root)} -> {exc}")
        failed += 1

for path in sorted(glob.glob(os.path.join(root, "**", "*.gguf"), recursive=True)):
    try:
        with open(path, "rb") as f:
            magic = f.read(4)
            if magic != b"GGUF":
                raise ValueError(f"magic inválido {magic!r} (esperado b'GGUF')")
            print(f"[OK] gguf: {os.path.relpath(path, root)}")
    except Exception as exc:
        print(f"[FAIL] gguf: {os.path.relpath(path, root)} -> {exc}")
        failed += 1

if failed > 0:
    print(f"\nFALHA: {failed} modelo(s) corrompido(s) encontrado(s).")
    sys.exit(1)

print("\nSUCESSO: Todos os modelos verificados estão íntegros.")
PY
