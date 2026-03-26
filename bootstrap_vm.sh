#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

log() {
  echo "$1"
}

ensure_base_packages() {
  apt-get update
  apt-get install -y ca-certificates curl git gnupg lsof nano pciutils psmisc wget
}

ensure_node20() {
  apt-get remove -y nodejs npm libnode-dev nodejs-doc || true
  apt-get autoremove -y || true

  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list

  apt-get update
  apt-get -f install -y
  apt-get install -y nodejs

  node -v
  npm -v
}

detect_nvidia() {
  if command -v nvidia-smi >/dev/null 2>&1; then
    return 0
  fi

  if lspci | grep -qi 'NVIDIA'; then
    log "[ERROR] NVIDIA GPU detected but nvidia-smi is unavailable. Install the NVIDIA driver and container runtime on the host, then retry."
    exit 1
  fi

  log "[ERROR] No NVIDIA GPU detected. This project currently expects an NVIDIA GPU-enabled environment."
  exit 1
}

select_torch_index() {
  local cuda_version="$1"
  python3 - "$cuda_version" <<'PY'
import sys

cuda_version = sys.argv[1].strip()
parts = cuda_version.split(".")
major = int(parts[0])
minor = int(parts[1]) if len(parts) > 1 else 0
code = major * 10 + minor
available = [
    (129, "https://download.pytorch.org/whl/cu129"),
    (128, "https://download.pytorch.org/whl/cu128"),
    (126, "https://download.pytorch.org/whl/cu126"),
    (124, "https://download.pytorch.org/whl/cu124"),
    (121, "https://download.pytorch.org/whl/cu121"),
    (118, "https://download.pytorch.org/whl/cu118"),
]
for supported_code, url in available:
    if code >= supported_code:
        print(url)
        break
else:
    sys.exit(1)
PY
}

configure_gpu_runtime() {
  local gpu_name
  local driver_version
  local cuda_version

  gpu_name="$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n 1)"
  driver_version="$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -n 1)"
  cuda_version="$(nvidia-smi | sed -n 's/.*CUDA Version: \([0-9.]\+\).*/\1/p' | head -n 1)"

  if [[ -z "${gpu_name}" || -z "${driver_version}" || -z "${cuda_version}" ]]; then
    log "[ERROR] Could not determine GPU, driver, or CUDA version from nvidia-smi."
    exit 1
  fi

  log "[INFO] GPU: ${gpu_name}"
  log "[INFO] NVIDIA driver: ${driver_version}"
  log "[INFO] CUDA reported by nvidia-smi: ${cuda_version}"

  if command -v nvcc >/dev/null 2>&1; then
    log "[INFO] nvcc detected: $(nvcc --version | tail -n 1)"
  else
    log "[INFO] nvcc not detected. That is acceptable for pip wheels; the host driver is what matters here."
  fi

  TORCH_INDEX_URL="$(select_torch_index "${cuda_version}")" || {
    log "[ERROR] No supported official PyTorch wheel mapping was found for CUDA ${cuda_version}."
    exit 1
  }
  export TORCH_INDEX_URL
  export TORCH_PACKAGES="torch torchvision torchaudio"
  export ONNXRUNTIME_PACKAGE="onnxruntime-gpu"
  export ONNXRUNTIME_EXTRA_INDEX_URL="https://aiinfra.pkgs.visualstudio.com/PublicPackages/_packaging/onnxruntime-cuda-12/pypi/simple/"

  log "[INFO] Selected PyTorch wheel index: ${TORCH_INDEX_URL}"
}

configure_network_binding() {
  local primary_ip
  primary_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  export COMFYUI_HOST="0.0.0.0"
  export WEBSITE_HOST="0.0.0.0"

  log "[INFO] Binding ComfyUI to ${COMFYUI_HOST}:3008"
  log "[INFO] Binding website to ${WEBSITE_HOST}:3010"
  if [[ -n "${primary_ip}" ]]; then
    log "[INFO] Access ComfyUI at: http://${primary_ip}:3008"
    log "[INFO] Access website at: http://${primary_ip}:3010"
  else
    log "[INFO] Access ComfyUI at: http://<vm-ip>:3008"
    log "[INFO] Access website at: http://<vm-ip>:3010"
  fi
}

main() {
  ensure_base_packages
  ensure_node20
  detect_nvidia
  configure_gpu_runtime
  configure_network_binding

  cd "${ROOT_DIR}"
  exec python main.py
}

main "$@"
