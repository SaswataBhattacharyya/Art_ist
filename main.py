#!/usr/bin/env python3
"""Project launcher for ComfyUI and the website."""

from __future__ import annotations

import os
import shlex
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable

from app_config import AppConfig, load_config
ROOT = Path(__file__).resolve().parent
COMFYUI_REPO = "https://github.com/comfyanonymous/ComfyUI.git"
APT_COMMAND_PACKAGES = {
    "curl": "curl",
    "fuser": "psmisc",
    "git": "git",
    "lsof": "lsof",
    "nano": "nano",
    "node": "nodejs",
    "npm": "npm",
    "wget": "wget",
}
CUSTOM_NODE_REPOS = [
    "https://github.com/Fannovel16/comfyui_controlnet_aux.git",
    "https://github.com/cubiq/ComfyUI_IPAdapter_plus.git",
    "https://github.com/Acly/comfyui-inpaint-nodes.git",
    "https://github.com/Acly/comfyui-tooling-nodes.git",
    "https://github.com/kijai/ComfyUI-WanVideoWrapper",
    "https://github.com/kijai/ComfyUI-WanAnimatePreprocess",
    "https://github.com/stduhpf/ComfyUI-WanMoeKSampler",
    "https://github.com/pollockjj/ComfyUI-MultiGPU",
    "https://github.com/evanspearman/ComfyMath",
    "https://github.com/ltdrdata/was-node-suite-comfyui",
    "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite",
    "https://github.com/yolain/ComfyUI-Easy-Use",
    "https://github.com/kijai/ComfyUI-KJNodes",
    "https://github.com/pythongosssss/ComfyUI-Custom-Scripts",
    "https://github.com/city96/ComfyUI-GGUF",
    "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation",
    "https://github.com/Comfy-Org/ComfyUI-Manager",
    "https://github.com/kijai/ComfyUI-segment-anything-2.git",
    "https://github.com/un-seen/comfyui-tensorops.git",
]
REQUIREMENTS_NODE_DIRS = [
    "comfyui_controlnet_aux",
    "ComfyUI-WanVideoWrapper",
    "comfyui-tensorops",
    "ComfyUI-GGUF",
    "ComfyUI-VideoHelperSuite",
]


def log(message: str) -> None:
    print(message, flush=True)


def run_command(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    log(f"[RUN] {' '.join(shlex.quote(part) for part in cmd)}")
    return subprocess.run(cmd, cwd=cwd, env=env, check=check, text=True)


def ensure_command(command: str, install_hint: str) -> None:
    if shutil.which(command):
        return
    raise RuntimeError(f"Required command '{command}' was not found. {install_hint}")


def _get_node_major_version() -> int | None:
    if not shutil.which("node"):
        return None

    result = subprocess.run(["node", "--version"], capture_output=True, text=True, check=False)
    version_text = result.stdout.strip() or result.stderr.strip()
    if result.returncode != 0 or not version_text:
        return None

    normalized = version_text.lstrip("v")
    major_text = normalized.split(".", 1)[0]
    try:
        return int(major_text)
    except ValueError:
        return None


def ensure_apt_packages() -> None:
    if not shutil.which("apt-get"):
        return

    missing_packages = sorted(
        {
            package
            for command, package in APT_COMMAND_PACKAGES.items()
            if shutil.which(command) is None
        }
    )
    if not missing_packages:
        return

    if hasattr(os, "geteuid") and os.geteuid() != 0:
        raise RuntimeError(
            "Missing required system packages: "
            f"{', '.join(missing_packages)}. Install them with apt or rerun as root."
        )

    env = os.environ.copy()
    env["DEBIAN_FRONTEND"] = "noninteractive"
    log(f"[SETUP] Installing system packages via apt: {', '.join(missing_packages)}")
    run_command(["apt-get", "update"], env=env)
    run_command(["apt-get", "install", "-y", *missing_packages], env=env)


def ensure_venv(config: AppConfig) -> Path:
    venv_python = config.venv_python
    if venv_python.exists():
        return venv_python

    log("[SETUP] Creating Python virtual environment")
    run_command([sys.executable, "-m", "venv", str(config.venv_dir)])
    return venv_python


def _comfyui_path_candidates(config: AppConfig) -> list[Path]:
    candidates = [
        config.comfyui_path,
        (config.project_root / "ComfyUI").resolve(),
        (config.project_root / "comfyui").resolve(),
    ]
    unique_candidates: list[Path] = []
    for candidate in candidates:
        if candidate not in unique_candidates:
            unique_candidates.append(candidate)
    return unique_candidates


def find_comfyui_path(config: AppConfig) -> Path | None:
    for candidate in _comfyui_path_candidates(config):
        if (candidate / "main.py").exists():
            return candidate
    return None


def ensure_comfyui_checkout(config: AppConfig) -> Path:
    existing_checkout = find_comfyui_path(config)
    if existing_checkout is not None:
        return existing_checkout

    ensure_command("git", "Install git to clone ComfyUI.")
    target_dir = config.comfyui_path
    for candidate in _comfyui_path_candidates(config):
        if not candidate.exists():
            continue
        if not candidate.is_dir():
            raise RuntimeError(f"ComfyUI path exists but is not a directory: {candidate}")
        if any(candidate.iterdir()):
            raise RuntimeError(
                f"ComfyUI directory exists but is incomplete: {candidate}. "
                "Remove it or populate it with a valid ComfyUI checkout."
            )
        target_dir = candidate

    target_dir.parent.mkdir(parents=True, exist_ok=True)
    log(f"[SETUP] Cloning ComfyUI from {COMFYUI_REPO} into {target_dir}")
    run_command(["git", "clone", COMFYUI_REPO, str(target_dir)])
    return target_dir


def install_python_dependencies(config: AppConfig) -> None:
    venv_python = ensure_venv(config)
    log("[SETUP] Installing Python runtime dependencies")
    run_command([str(venv_python), "-m", "pip", "install", "--upgrade", "pip"])
    run_command([str(venv_python), "-m", "pip", "install", "-r", str(config.requirements_file)])


def install_selected_torch_runtime(config: AppConfig) -> None:
    torch_index_url = os.environ.get("TORCH_INDEX_URL")
    torch_packages = os.environ.get("TORCH_PACKAGES", "torch torchvision torchaudio").split()
    if not torch_index_url or not torch_packages:
        return

    log(f"[SETUP] Installing PyTorch runtime from {torch_index_url}")
    run_command(
        [
            str(config.venv_python),
            "-m",
            "pip",
            "install",
            "--upgrade",
            *torch_packages,
            "--index-url",
            torch_index_url,
        ]
    )


def install_comfyui_requirements(config: AppConfig) -> None:
    if not config.start_comfyui:
        return

    install_selected_torch_runtime(config)
    requirements_file = ensure_comfyui_checkout(config) / "requirements.txt"
    if not requirements_file.exists():
        log(f"[WARN] Skipping ComfyUI requirements install because {requirements_file} does not exist")
        return

    log("[SETUP] Installing ComfyUI Python dependencies")
    run_command([str(config.venv_python), "-m", "pip", "install", "-r", str(requirements_file)])


def ensure_frontend_dependencies(config: AppConfig) -> bool:
    if not config.start_website:
        return False

    package_json = config.frontend_dir / "package.json"
    dist_dir = config.frontend_dir / "dist"
    if not package_json.exists():
        if dist_dir.exists():
            log(
                "[WARN] Frontend source checkout is missing package.json. "
                "Using existing frontend build from ai-art-generator-hub/dist."
            )
            return True
        log(
            "[WARN] Frontend source checkout is incomplete: "
            f"{package_json} does not exist. The website UI will be skipped."
        )
        return False

    if not shutil.which("npm"):
        if dist_dir.exists():
            log("[WARN] npm was not found. Using existing frontend build from ai-art-generator-hub/dist.")
            return True
        log("[WARN] npm was not found and no frontend build exists. The website UI will be skipped.")
        return False

    node_major = _get_node_major_version()
    if node_major is None:
        if dist_dir.exists():
            log("[WARN] Could not determine Node.js version. Using existing frontend build from ai-art-generator-hub/dist.")
            return True
        raise RuntimeError("Could not determine Node.js version. Install Node.js 18 or newer to build the frontend.")

    if node_major < 18:
        if dist_dir.exists():
            log(
                f"[WARN] Node.js {node_major} is too old for this frontend build. "
                "Using existing frontend build from ai-art-generator-hub/dist."
            )
            return True
        raise RuntimeError(
            f"Node.js {node_major} is too old for this frontend. "
            "Install Node.js 18 or newer (Node 20 LTS recommended), "
            "or run ./bootstrap_vm.sh on the target VM."
        )

    node_modules = config.frontend_dir / "node_modules"
    if node_modules.exists():
        log("[SETUP] Frontend dependencies already present, skipping npm install")
    else:
        log("[SETUP] Installing frontend dependencies")
        run_command(["npm", "install"], cwd=config.frontend_dir)

    log("[SETUP] Building frontend")
    run_command(["npm", "run", "build"], cwd=config.frontend_dir)
    return True


def kill_port(port: int) -> None:
    tools = (
        ["lsof", "-ti", f":{port}"],
        ["fuser", f"{port}/tcp"],
    )
    for tool in tools:
        if not shutil.which(tool[0]):
            continue
        result = subprocess.run(tool, capture_output=True, text=True, check=False)
        output = result.stdout if tool[0] == "lsof" else result.stderr
        pids = [token for token in output.split() if token.isdigit()]
        for pid in pids:
            try:
                os.kill(int(pid), signal.SIGTERM)
                log(f"[INFO] Stopped process {pid} on port {port}")
            except ProcessLookupError:
                pass
        if pids:
            time.sleep(1)
        return


def start_process(
    name: str,
    cmd: list[str],
    *,
    cwd: Path,
    env: dict[str, str] | None = None,
) -> subprocess.Popen[str]:
    log(f"[START] {name}: {' '.join(shlex.quote(part) for part in cmd)}")
    process = subprocess.Popen(cmd, cwd=cwd, env=env)
    time.sleep(2)
    if process.poll() is not None:
        raise RuntimeError(f"{name} exited early with code {process.returncode}")
    return process


def restart_process(
    process: subprocess.Popen[str] | None,
    name: str,
    cmd: list[str],
    *,
    cwd: Path,
    env: dict[str, str] | None = None,
) -> subprocess.Popen[str]:
    if process is not None and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
    return start_process(name, cmd, cwd=cwd, env=env)


def start_comfyui(config: AppConfig) -> subprocess.Popen[str] | None:
    if not config.start_comfyui:
        log("[SKIP] START_COMFYUI is false")
        return None

    comfyui_path = ensure_comfyui_checkout(config)
    comfyui_main = comfyui_path / "main.py"
    if not comfyui_main.exists():
        raise RuntimeError(f"ComfyUI entry point not found: {comfyui_main}")

    kill_port(config.comfyui_port)
    return start_process(
        "ComfyUI",
        [
            str(config.venv_python),
            str(comfyui_main),
            "--listen",
            config.comfyui_host,
            "--port",
            str(config.comfyui_port),
        ],
        cwd=comfyui_path,
        env=config.base_env,
    )


def _repo_dirname(repo_url: str) -> str:
    name = repo_url.rstrip("/").split("/")[-1]
    if name.endswith(".git"):
        name = name[:-4]
    return name


def install_custom_nodes(config: AppConfig) -> None:
    ensure_command("git", "Install git to clone ComfyUI custom nodes.")
    custom_nodes_dir = ensure_comfyui_checkout(config) / "custom_nodes"
    custom_nodes_dir.mkdir(parents=True, exist_ok=True)

    for repo in CUSTOM_NODE_REPOS:
        target_dir = custom_nodes_dir / _repo_dirname(repo)
        if target_dir.exists():
            log(f"[SETUP] Custom node already present: {target_dir.name}")
            continue
        log(f"[SETUP] Cloning custom node: {repo}")
        run_command(["git", "clone", repo], cwd=custom_nodes_dir)


def install_custom_node_requirements(config: AppConfig) -> None:
    custom_nodes_dir = ensure_comfyui_checkout(config) / "custom_nodes"
    for node_dir in REQUIREMENTS_NODE_DIRS:
        requirements_file = custom_nodes_dir / node_dir / "requirements.txt"
        if not requirements_file.exists():
            log(f"[WARN] Skipping missing requirements file: {requirements_file}")
            continue
        log(f"[SETUP] Installing requirements for {node_dir}")
        run_command([str(config.venv_python), "-m", "pip", "install", "-r", str(requirements_file)])

    log("[SETUP] Installing ComfyUI-VideoHelperSuite extra packages")
    run_command(
        [
            str(config.venv_python),
            "-m",
            "pip",
            "install",
            "aiohttp",
            "tqdm",
            "rembg[cpu]",
            "rembg[gpu]",
            "accelerate",
            "gguf",
            "surrealist",
            "diffusers",
            "imageio-ffmpeg",
            "sageattention",
            "huggingface_hub",
        ]
    )
    run_command([str(config.venv_python), "-m", "pip", "uninstall", "-y", "onnxruntime", "onnxruntime-gpu"])
    onnxruntime_package = os.environ.get("ONNXRUNTIME_PACKAGE", "onnxruntime-gpu")
    onnxruntime_extra_index = os.environ.get(
        "ONNXRUNTIME_EXTRA_INDEX_URL",
        "https://aiinfra.pkgs.visualstudio.com/PublicPackages/_packaging/onnxruntime-cuda-12/pypi/simple/",
    )
    install_command = [
        str(config.venv_python),
        "-m",
        "pip",
        "install",
        onnxruntime_package,
    ]
    if onnxruntime_package == "onnxruntime-gpu" and onnxruntime_extra_index:
        install_command.extend(["--extra-index-url", onnxruntime_extra_index])
    log(f"[SETUP] Installing ONNX Runtime package: {onnxruntime_package}")
    run_command(install_command)


def start_website(config: AppConfig) -> subprocess.Popen[str]:
    kill_port(config.website_port)
    env = {
        **config.base_env,
        "WEBSITE_PORT": str(config.website_port),
        "PYTHONPATH": str(ROOT),
    }
    return start_process(
        "Website",
        [
            str(config.venv_python),
            "-m",
            "uvicorn",
            "api_server.main:app",
            "--host",
            config.website_host,
            "--port",
            str(config.website_port),
        ],
        cwd=ROOT,
        env=env,
    )


def terminate_processes(processes: Iterable[subprocess.Popen[str]]) -> None:
    for process in processes:
        if process.poll() is None:
            process.terminate()
    for process in processes:
        if process.poll() is None:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


def main() -> None:
    config = load_config(ROOT, prompt_for_ports=True)
    ensure_apt_packages()
    comfyui_path = find_comfyui_path(config) or config.comfyui_path

    log("Agentic Art Builder")
    log("===================")
    log(f"ComfyUI path: {comfyui_path}")
    log(f"Website: http://localhost:{config.website_port}")
    log(f"ComfyUI target: http://{config.comfyui_host}:{config.comfyui_port}")

    install_python_dependencies(config)
    install_comfyui_requirements(config)
    frontend_ready = ensure_frontend_dependencies(config)

    processes: list[subprocess.Popen[str]] = []
    try:
        comfyui_process = start_comfyui(config)
        if comfyui_process is not None:
            processes.append(comfyui_process)

        if config.start_comfyui:
            install_custom_nodes(config)
            install_custom_node_requirements(config)
            if comfyui_process is not None:
                comfyui_path = ensure_comfyui_checkout(config)
                log("[SETUP] Restarting ComfyUI to load installed custom nodes")
                comfyui_process = restart_process(
                    comfyui_process,
                    "ComfyUI",
                    [
                        str(config.venv_python),
                        str(comfyui_path / "main.py"),
                        "--listen",
                        config.comfyui_host,
                        "--port",
                        str(config.comfyui_port),
                    ],
                    cwd=comfyui_path,
                    env=config.base_env,
                )
                processes[0] = comfyui_process

        if config.start_website:
            if frontend_ready:
                processes.append(start_website(config))
            else:
                log("[SKIP] Website was not started because the frontend build is unavailable")
        else:
            log("[SKIP] START_WEBSITE is false")

        if not processes:
            log("[INFO] Nothing was started because both START_COMFYUI and START_WEBSITE are false")
            return

        log("[READY] Services are running. Press Ctrl+C to stop them.")
        while True:
            for process in processes:
                exit_code = process.poll()
                if exit_code is not None:
                    raise RuntimeError(f"Process {process.args[0]} exited with code {exit_code}")
            time.sleep(2)
    except KeyboardInterrupt:
        log("[INFO] Stopping services")
    finally:
        terminate_processes(processes)


if __name__ == "__main__":
    main()
