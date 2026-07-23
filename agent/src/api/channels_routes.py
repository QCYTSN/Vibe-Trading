"""IM channel HTTP routes.

Mounted by ``agent/api_server.py`` via ``register_channels_routes(app, ...)``.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import tempfile
from pathlib import Path
from typing import Any, Awaitable, Callable

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Pydantic models (defined locally -- NO shared modules, per maintainer rule)
# ---------------------------------------------------------------------------

class ChannelPairingCommandRequest(BaseModel):
    """Pairing command payload for IM channel sender pairing."""

    channel: str
    command: str


class ChannelConfigUpdateRequest(BaseModel):
    """Update one adapter section while preserving the rest of agent.json."""

    channel: str = Field(..., min_length=1, max_length=64)
    enabled: bool
    config: dict[str, Any] = Field(default_factory=dict)


class WeixinLoginRequest(BaseModel):
    force: bool = True


_weixin_login: dict[str, Any] = {"phase": "idle", "message": "", "qr_data_url": ""}
_weixin_login_task: asyncio.Task | None = None


# ---------------------------------------------------------------------------
# Lifecycle helpers (module-level, access host state via sys.modules)
# ---------------------------------------------------------------------------


async def _start_channel_runtime():
    """Start the IM channel runtime."""
    import sys as _sys

    host = _sys.modules.get("api_server") or _sys.modules.get("agent.api_server")
    runtime = host._get_channel_runtime()
    await runtime.start(start_manager=True)
    return runtime


async def _stop_channel_runtime() -> None:
    """Stop the IM channel runtime if it was initialized."""
    import sys as _sys

    host = _sys.modules.get("api_server") or _sys.modules.get("agent.api_server")
    if host._channel_runtime is None:
        return
    await host._channel_runtime.stop()


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

AuthDep = Callable[..., Awaitable[Any] | Any]


def register_channels_routes(
    app: FastAPI,
    require_auth: AuthDep | None = None,
) -> None:
    """Mount the channel routes onto ``app``.

    Resolves ``require_auth`` from the host ``api_server`` module via
    ``sys.modules`` when not passed explicitly.
    """
    # Resolve host dependencies via sys.modules fallback
    import sys as _sys

    host = _sys.modules.get("api_server") or _sys.modules.get("agent.api_server")

    if host is None:
        raise RuntimeError(
            "register_channels_routes: api_server module not in sys.modules; "
            "ensure api_server is imported before calling this function"
        )

    if require_auth is None:
        require_auth = host.require_auth

    # Late-access closure for monkeypatch compatibility
    def _get_channel_runtime():
        """Late-access _get_channel_runtime for test monkeypatch compat."""
        h = _sys.modules.get("api_server") or _sys.modules.get("agent.api_server")
        return h._get_channel_runtime()

    # --- Routes ---

    @app.get("/channels/status", dependencies=[Depends(require_auth)])
    async def channels_status():
        """Return IM channel runtime and adapter status."""
        runtime = _get_channel_runtime()
        return runtime.status()

    @app.post("/channels/start", dependencies=[Depends(require_auth)])
    async def channels_start():
        """Start configured IM channel adapters."""
        runtime = await _start_channel_runtime()
        return {"status": "started", **runtime.status()}

    @app.post("/channels/stop", dependencies=[Depends(require_auth)])
    async def channels_stop():
        """Stop configured IM channel adapters."""
        runtime = _get_channel_runtime()
        await runtime.stop()
        return {"status": "stopped", **runtime.status()}

    @app.post("/channels/pairing/command", dependencies=[Depends(require_auth)])
    async def channels_pairing_command(payload: ChannelPairingCommandRequest):
        """Run a pairing command against the shared pairing store."""
        from src.channels.pairing import handle_pairing_command

        return {
            "channel": payload.channel,
            "reply": handle_pairing_command(payload.channel, payload.command),
        }

    @app.get("/channels/catalog", dependencies=[Depends(require_auth)])
    async def channels_catalog():
        """Return every built-in adapter and its configuration schema."""
        from src.channels.config import load_channels_config
        from src.channels.registry import discover_channel_names, inspect_channel

        config = load_channels_config()
        items = []
        for name in sorted(discover_channel_names()):
            availability = inspect_channel(name).to_dict()
            section = config.get(name) if isinstance(config, dict) else None
            items.append({
                **availability,
                "configured": isinstance(section, dict),
                "enabled": bool(section.get("enabled", False)) if isinstance(section, dict) else False,
                "config": _redact_config(section or {}),
                "schema": _adapter_schema(name),
                "setup_mode": "weixin_qr" if name == "weixin" else "form",
            })
        return {"channels": items}

    @app.put("/channels/config", dependencies=[Depends(require_auth)])
    async def channels_config_update(payload: ChannelConfigUpdateRequest):
        """Persist one channel section and rebuild the in-process runtime."""
        from src.channels.registry import discover_channel_names

        if payload.channel not in set(discover_channel_names()):
            raise HTTPException(status_code=404, detail="Unknown channel adapter")
        await _replace_channel_config(payload.channel, payload.enabled, payload.config)
        await _reset_channel_runtime()
        return {"status": "saved", "channel": payload.channel, "enabled": payload.enabled}

    @app.post("/channels/weixin/login", dependencies=[Depends(require_auth)])
    async def weixin_login_start(payload: WeixinLoginRequest):
        """Start personal WeChat QR login without exposing its token."""
        global _weixin_login_task
        if _weixin_login_task and not _weixin_login_task.done():
            return dict(_weixin_login)
        _weixin_login.clear()
        _weixin_login.update({"phase": "starting", "message": "正在获取二维码…", "qr_data_url": ""})
        _weixin_login_task = asyncio.create_task(_run_weixin_login(payload.force))
        for _ in range(60):
            if _weixin_login.get("qr_data_url") or _weixin_login.get("phase") == "error":
                break
            await asyncio.sleep(0.1)
        return dict(_weixin_login)

    @app.get("/channels/weixin/login", dependencies=[Depends(require_auth)])
    async def weixin_login_status():
        return dict(_weixin_login)


def _adapter_schema(name: str) -> dict[str, Any]:
    try:
        import inspect
        import importlib
        from typing import get_type_hints
        from pydantic import BaseModel as PydanticModel
        from src.channels.registry import load_channel_class

        channel_class = load_channel_class(name)
        config_type = get_type_hints(channel_class.__init__).get("config")
        if not (inspect.isclass(config_type) and issubclass(config_type, PydanticModel)):
            module = importlib.import_module(f"src.channels.{name}")
            expected = f"{name.replace('_', '').lower()}config"
            candidates = [
                value for value in vars(module).values()
                if inspect.isclass(value)
                and issubclass(value, PydanticModel)
                and value is not PydanticModel
                and value.__name__.replace("_", "").lower() == expected
            ]
            config_type = candidates[0] if candidates else None
        if inspect.isclass(config_type) and issubclass(config_type, PydanticModel):
            return config_type.model_json_schema()
    except Exception:
        return {"type": "object", "properties": {}}
    return {"type": "object", "properties": {}}


def _redact_config(value: Any, key: str = "") -> Any:
    secret_parts = ("token", "secret", "password", "api_key", "private_key", "signing")
    if any(part in key.lower() for part in secret_parts) and value not in (None, ""):
        return "••••••••"
    if isinstance(value, dict):
        return {str(k): _redact_config(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact_config(item, key) for item in value]
    return value


async def _replace_channel_config(name: str, enabled: bool, config: dict[str, Any]) -> None:
    from src.config.loader import _read_config_file
    from src.config.paths import get_config_path, get_runtime_root

    active = get_config_path()
    raw: dict[str, Any] = {}
    if active.exists():
        try:
            raw = _read_config_file(active)
        except (OSError, ValueError):
            raw = {}
    channels = raw.get("channels")
    if not isinstance(channels, dict):
        channels = {}
    section = {key: value for key, value in config.items() if value != "••••••••"}
    existing = channels.get(name)
    if isinstance(existing, dict):
        existing.update(section)
        section = existing
    section["enabled"] = enabled
    channels[name] = section
    raw["channels"] = channels

    target = get_runtime_root() / "agent.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=target.parent, delete=False, suffix=".tmp") as handle:
        json.dump(raw, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(target)


async def _reset_channel_runtime() -> None:
    import sys as _sys
    from src.api import state

    host = _sys.modules.get("api_server") or _sys.modules.get("agent.api_server")
    runtime = getattr(host, "_channel_runtime", None) if host else None
    if runtime is not None:
        await runtime.stop()
    state._channel_runtime = None
    state._channel_manager = None
    state._channel_bus = None
    if host is not None:
        host._channel_runtime = None
        host._channel_manager = None
        host._channel_bus = None


async def _run_weixin_login(force: bool) -> None:
    try:
        import qrcode
        from src.channels.bus.queue import MessageBus
        from src.channels.weixin import WeixinChannel, WeixinConfig

        channel = WeixinChannel(WeixinConfig(enabled=True), MessageBus())

        def capture(url: str) -> None:
            image = qrcode.make(url)
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            _weixin_login.update({
                "phase": "waiting",
                "message": "请使用微信扫描二维码并在手机上确认。",
                "qr_data_url": f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode('ascii')}",
            })

        channel._print_qr_code = capture  # type: ignore[method-assign]
        success = await channel.login(force=force)
        _weixin_login.update({
            "phase": "confirmed" if success else "error",
            "message": "微信登录成功，正在安全保存凭证。" if success else "微信登录未完成，请重新扫码。",
            "qr_data_url": "" if success else _weixin_login.get("qr_data_url", ""),
        })
    except Exception as exc:
        _weixin_login.update({"phase": "error", "message": f"{type(exc).__name__}: {exc}"})
