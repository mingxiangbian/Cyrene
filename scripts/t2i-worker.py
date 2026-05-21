#!/usr/bin/env python3
"""Persistent local SD1.5 text-to-image worker."""

from __future__ import annotations

import argparse
import json
import os
import random
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


DESCRIPTION = "Local SD1.5 text-to-image worker"
DEFAULT_MODEL_PATH = "./T2I/majicmixRealistic_v7.safetensors"
DEPENDENCY_ERROR = (
    "Missing T2I dependencies. Install them with: "
    "python3 -m pip install -r requirements-t2i.txt"
)


class WorkerState:
    def __init__(self, model_path: str, pipe: Any, torch_module: Any):
        self.model_path = model_path
        self.model_name = Path(model_path).stem
        self.pipe = pipe
        self.torch = torch_module
        self.generation_lock = threading.Lock()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "7861")))
    parser.add_argument(
        "--model-path",
        default=os.environ.get("T2I_MODEL_PATH", DEFAULT_MODEL_PATH),
        help=f"Path to a single-file SD1.5 checkpoint. Default: {DEFAULT_MODEL_PATH}",
    )
    return parser.parse_args()


def load_pipeline(model_path: str) -> tuple[Any, Any]:
    try:
        import torch
        from diffusers import EulerAncestralDiscreteScheduler, StableDiffusionPipeline
    except ImportError as exc:
        raise RuntimeError(DEPENDENCY_ERROR) from exc

    if torch.cuda.is_available():
        device = "cuda"
        dtype = torch.float16
    elif getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        device = "mps"
        dtype = torch.float16
    else:
        device = "cpu"
        dtype = torch.float32

    pipe = StableDiffusionPipeline.from_single_file(
        model_path,
        torch_dtype=dtype,
        safety_checker=None,
        requires_safety_checker=False,
    )
    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
    pipe.to(device)
    return pipe, torch


def json_response(handler: BaseHTTPRequestHandler, status: HTTPStatus, body: dict[str, Any]) -> None:
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json")
    handler.send_header("content-length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


def read_json_body(handler: BaseHTTPRequestHandler) -> tuple[Any | None, str | None]:
    try:
        content_length = int(handler.headers.get("content-length", "0"))
    except ValueError:
        return None, "Invalid content length."

    try:
        body = handler.rfile.read(content_length).decode("utf-8")
        return json.loads(body), None
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None, "Invalid JSON body."


def validate_payload(payload: Any) -> tuple[dict[str, Any] | None, str | None]:
    if not isinstance(payload, dict):
        return None, "request body must be a JSON object"

    prompt = payload.get("prompt")
    output_dir = payload.get("output_dir")
    if not isinstance(prompt, str) or not prompt.strip():
        return None, "prompt is required"
    if not isinstance(output_dir, str) or not os.path.isabs(output_dir):
        return None, "output_dir must be an absolute path"

    try:
        width = int(payload.get("width", 512))
        height = int(payload.get("height", 768))
        steps = int(payload.get("steps", 30))
        cfg_scale = float(payload.get("cfg_scale", 7))
        count = int(payload.get("count", 1))
    except (TypeError, ValueError):
        return None, "width, height, steps, cfg_scale, and count must be numeric"

    seed = payload.get("seed")
    if seed is not None:
        try:
            seed = int(seed)
        except (TypeError, ValueError):
            return None, "seed must be an integer"

    if width <= 0 or height <= 0 or steps <= 0 or count <= 0:
        return None, "width, height, steps, and count must be positive"

    return {
        "prompt": prompt.strip(),
        "negative_prompt": payload.get("negative_prompt", "") or "",
        "output_dir": output_dir,
        "width": width,
        "height": height,
        "steps": steps,
        "cfg_scale": cfg_scale,
        "seed": seed,
        "count": count,
    }, None


def generate_images(state: WorkerState, request: dict[str, Any]) -> list[dict[str, Any]]:
    output_dir = Path(request["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    base_seed = request["seed"]
    if base_seed is None:
        base_seed = random.randint(0, 2**31 - 1)

    images: list[dict[str, Any]] = []
    for index in range(request["count"]):
        seed = base_seed + index
        generator = state.torch.Generator(device=state.pipe.device).manual_seed(seed)
        kwargs = {
            "prompt": request["prompt"],
            "negative_prompt": request["negative_prompt"],
            "width": request["width"],
            "height": request["height"],
            "num_inference_steps": request["steps"],
            "guidance_scale": request["cfg_scale"],
            "generator": generator,
            "clip_skip": 2,
        }
        try:
            result = state.pipe(**kwargs)
        except TypeError as exc:
            if "clip_skip" not in str(exc):
                raise
            kwargs.pop("clip_skip")
            result = state.pipe(**kwargs)

        file_path = output_dir / f"{seed}.png"
        result.images[0].save(file_path)
        images.append({
            "path": str(file_path),
            "seed": seed,
            "width": request["width"],
            "height": request["height"],
        })

    return images


class T2IHandler(BaseHTTPRequestHandler):
    server: "T2IServer"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:
        if self.path != "/health":
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})
            return

        json_response(self, HTTPStatus.OK, {"ok": True, "model": self.server.state.model_name})

    def do_POST(self) -> None:
        if self.path != "/generate":
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})
            return

        payload, body_error = read_json_body(self)
        if body_error is not None:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": body_error})
            return

        request, error = validate_payload(payload)
        if error is not None or request is None:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": error})
            return

        if not self.server.state.generation_lock.acquire(blocking=False):
            json_response(self, HTTPStatus.CONFLICT, {"error": "generation already in progress"})
            return

        try:
            images = generate_images(self.server.state, request)
        except Exception as exc:
            json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
            return
        finally:
            self.server.state.generation_lock.release()

        json_response(self, HTTPStatus.OK, {"model": self.server.state.model_name, "images": images})


class T2IServer(ThreadingHTTPServer):
    def __init__(self, address: tuple[str, int], state: WorkerState):
        super().__init__(address, T2IHandler)
        self.state = state


def main() -> int:
    args = parse_args()
    try:
        pipe, torch_module = load_pipeline(args.model_path)
    except RuntimeError as exc:
        print(str(exc), file=os.sys.stderr)
        return 1

    state = WorkerState(args.model_path, pipe, torch_module)
    server = T2IServer((args.host, args.port), state)
    print(f"{DESCRIPTION} listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
