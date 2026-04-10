"""Backend for the local Agentic Art prototype."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = PROJECT_ROOT / "assets"
FRONTEND_DIST = PROJECT_ROOT / "ai-art-generator-hub" / "dist"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Agentic Art Builder Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ActionResponse(BaseModel):
    action_id: str
    response: str


class UploadResponse(BaseModel):
    asset_id: str
    path: str


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _idle_status() -> dict[str, Any]:
    return {
        "job_id": None,
        "state": "DISABLED",
        "current_task": "Generation pipeline is in placeholder mode",
        "progress": 0,
        "logs": [
            {
                "id": "integration-disabled",
                "timestamp": _timestamp(),
                "level": "warning",
                "message": "No jobs are sent to ComfyUI yet. Upload and status endpoints are active.",
            }
        ],
        "completed_tasks": [],
    }


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "mode": "placeholder",
        "comfyui_enabled": False,
        "project": "agentic-art-bare-minimum",
        "website_host": os.environ.get("WEBSITE_HOST", "127.0.0.1"),
        "website_port": os.environ.get("WEBSITE_PORT", "3010"),
    }


@app.get("/api/status")
async def status() -> dict[str, Any]:
    return {
        "website": "running",
        "generation": "disabled",
        "project": "agentic-art-bare-minimum",
        "message": "Website is running in placeholder mode. ComfyUI is not wired into generation requests yet.",
    }


@app.post("/api/generate")
async def generate(request: Request) -> dict[str, Any]:
    form = await request.form()
    metadata = form.get("metadata")
    parsed_metadata: Any = None
    if isinstance(metadata, str):
        try:
            parsed_metadata = json.loads(metadata)
        except json.JSONDecodeError:
            parsed_metadata = metadata

    return {
        "status": "disabled",
        "message": "Generation is disabled in this prototype build",
        "received_metadata": parsed_metadata,
    }


@app.post("/api/jobs")
async def create_job(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": str(uuid.uuid4()),
        "status": "disabled",
        "message": "Job creation is stubbed until the website-to-ComfyUI bridge is restored.",
        "received": payload,
    }


@app.post("/api/upload", response_model=UploadResponse)
async def upload_asset(file: UploadFile = File(...), asset_type: str = Form("unknown")) -> UploadResponse:
    suffix = Path(file.filename or "upload.bin").suffix
    asset_id = str(uuid.uuid4())
    filename = f"{asset_id}{suffix}"
    destination = ASSETS_DIR / filename
    destination.write_bytes(await file.read())
    return UploadResponse(asset_id=asset_id, path=f"assets/{filename}")


@app.get("/api/agent/status")
async def get_agent_status() -> dict[str, Any]:
    return _idle_status()


@app.get("/api/agent/pending_action")
async def get_pending_action() -> dict[str, Any]:
    return {"action": None}


@app.post("/api/agent/response")
async def submit_response(response: ActionResponse) -> dict[str, Any]:
    return {
        "status": "ignored",
        "message": "No interactive backend actions are waiting in placeholder mode.",
        "action_id": response.action_id,
    }


@app.get("/api/agent/artifacts/{job_id}")
async def get_artifacts(job_id: str) -> list[dict[str, Any]]:
    return []


@app.get("/api/media/{filename}")
async def get_media(filename: str) -> FileResponse:
    target = ASSETS_DIR / filename
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(target)


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="static")
