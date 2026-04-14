#!/usr/bin/env python3
"""
V1 NFR baseline runner.

Runs concurrent room flows against local backend/worker and reports:
- success/failure counts
- per-step latency stats (p50/p95/p99)
- directional translation correctness checks (vi->en, en->vi)
"""

from __future__ import annotations

import argparse
import json
import statistics
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass


@dataclass
class StepTiming:
    auth_ms: float = 0.0
    create_ms: float = 0.0
    join_ms: float = 0.0
    sim_host_ms: float = 0.0
    sim_guest_ms: float = 0.0
    history_ms: float = 0.0
    end_ms: float = 0.0


def http_json(method: str, url: str, payload: dict | None, timeout_sec: float) -> tuple[dict, float]:
    body = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url=url, data=body, headers=headers, method=method)
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    elapsed_ms = (time.perf_counter() - t0) * 1000
    return data, elapsed_ms


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    idx = max(0, min(len(values) - 1, int(round((p / 100.0) * (len(values) - 1)))))
    ordered = sorted(values)
    return ordered[idx]


def run_one_flow(idx: int, backend_base: str, worker_base: str, timeout_sec: float) -> dict:
    timing = StepTiming()
    errors: list[str] = []
    checks = {
        "host_vi_to_en": False,
        "guest_en_to_vi": False,
    }
    room_id = ""
    session_id = ""

    try:
        guest_resp, timing.auth_ms = http_json(
            "POST",
            f"{backend_base}/api/v1/auth/guest",
            {"display_name": f"Guest Load {idx}"},
            timeout_sec,
        )
        guest_user_id = guest_resp["user"]["userId"]

        create_resp, timing.create_ms = http_json(
            "POST",
            f"{backend_base}/api/v1/rooms",
            {
                "host_user_id": f"host_load_{idx}",
                "host_identity": f"host_device_load_{idx}",
                "host_display_name": f"Host Load {idx}",
                "provider_profile": "silero+google_stt+openai_translate+google_tts",
                "supported_languages": ["vi", "en"],
                "host_settings": {"source_language": "vi", "target_language": "en", "voice_profile": "host-default"},
            },
            timeout_sec,
        )
        room_id = create_resp["room"]["roomId"]
        session_id = create_resp["room"]["sessionId"]

        _, timing.join_ms = http_json(
            "POST",
            f"{backend_base}/api/v1/rooms/join",
            {
                "room_id": room_id,
                "guest_user_id": guest_user_id,
                "guest_identity": f"guest_device_load_{idx}",
                "guest_display_name": f"Guest Load {idx}",
                "guest_settings": {"source_language": "en", "target_language": "vi", "voice_profile": "guest-default"},
            },
            timeout_sec,
        )

        sim_host, timing.sim_host_ms = http_json(
            "POST",
            f"{worker_base}/internal/sessions/{session_id}/simulate-utterance",
            {
                "speaker_identity": f"host_device_load_{idx}",
                "text": "xin chao toi dang load test",
            },
            timeout_sec,
        )

        for evt in sim_host.get("events", []):
            if evt.get("type") == "translation.final":
                checks["host_vi_to_en"] = evt.get("source_lang") == "vi" and evt.get("target_lang") == "en"

        sim_guest, timing.sim_guest_ms = http_json(
            "POST",
            f"{worker_base}/internal/sessions/{session_id}/simulate-utterance",
            {
                "speaker_identity": f"guest_device_load_{idx}",
                "text": "hello i am load testing",
            },
            timeout_sec,
        )

        for evt in sim_guest.get("events", []):
            if evt.get("type") == "translation.final":
                checks["guest_en_to_vi"] = evt.get("source_lang") == "en" and evt.get("target_lang") == "vi"

        query = urllib.parse.urlencode({"session_id": session_id, "limit": 50})
        history_resp, timing.history_ms = http_json(
            "GET",
            f"{backend_base}/api/v1/history?{query}",
            None,
            timeout_sec,
        )
        if len(history_resp.get("items", [])) < 4:
            errors.append("history_items_less_than_4")

    except urllib.error.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8")
        except Exception:
            body = ""
        errors.append(f"http_{exc.code}:{body[:200]}")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"exception:{exc}")
    finally:
        if room_id:
            try:
                _, timing.end_ms = http_json("POST", f"{backend_base}/api/v1/rooms/{room_id}/end", None, timeout_sec)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"end_failed:{exc}")

    return {
        "ok": len(errors) == 0 and all(checks.values()),
        "errors": errors,
        "checks": checks,
        "timing_ms": timing.__dict__,
        "room_id": room_id,
        "session_id": session_id,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="http://localhost:8080")
    parser.add_argument("--worker", default="http://localhost:8090")
    parser.add_argument("--rooms", type=int, default=20, help="total room flows to run")
    parser.add_argument("--concurrency", type=int, default=10, help="parallel workers")
    parser.add_argument("--timeout-sec", type=float, default=15.0)
    parser.add_argument(
        "--duration-sec",
        type=int,
        default=0,
        help="when > 0, run repeated rounds until duration budget is exhausted",
    )
    args = parser.parse_args()

    started_at = time.time()
    lock = threading.Lock()
    results: list[dict] = []
    rounds = 0
    next_idx = 0

    def run_round(batch_size: int) -> None:
        nonlocal next_idx
        with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            futures = [
                pool.submit(run_one_flow, next_idx + i, args.backend, args.worker, args.timeout_sec)
                for i in range(batch_size)
            ]
            next_idx += batch_size
            for fut in as_completed(futures):
                item = fut.result()
                with lock:
                    results.append(item)

    if args.duration_sec > 0:
        deadline = started_at + args.duration_sec
        while time.time() < deadline:
            run_round(args.rooms)
            rounds += 1
    else:
        run_round(args.rooms)
        rounds = 1

    elapsed_sec = time.time() - started_at
    ok = [r for r in results if r["ok"]]
    fail = [r for r in results if not r["ok"]]

    def extract(step: str) -> list[float]:
        return [float(r["timing_ms"][step]) for r in results if float(r["timing_ms"].get(step, 0.0)) > 0]

    metrics = {}
    for step in ["auth_ms", "create_ms", "join_ms", "sim_host_ms", "sim_guest_ms", "history_ms", "end_ms"]:
        vals = extract(step)
        metrics[step] = {
            "count": len(vals),
            "avg": round(statistics.mean(vals), 2) if vals else 0.0,
            "p50": round(percentile(vals, 50), 2) if vals else 0.0,
            "p95": round(percentile(vals, 95), 2) if vals else 0.0,
            "p99": round(percentile(vals, 99), 2) if vals else 0.0,
        }

    summary = {
        "rooms": args.rooms,
        "concurrency": args.concurrency,
        "rounds": rounds,
        "flows_total": len(results),
        "duration_sec_requested": args.duration_sec,
        "elapsed_sec": round(elapsed_sec, 2),
        "success": len(ok),
        "failed": len(fail),
        "success_rate": round((len(ok) / max(1, len(results))) * 100, 2),
        "metrics_ms": metrics,
        "failed_samples": fail[:5],
    }
    print(json.dumps(summary, indent=2, ensure_ascii=True))
    return 0 if len(fail) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
