"""
Progress tracking with exponential decay estimation.

Instead of fake fixed-step delays, we use:
  pct(t) = min(95, floor((1 - e^(-t/tau)) * 100))

Where tau is calibrated per model so the curve matches typical generation times.
The task is cancelled and mark_complete() is called once the real model finishes.
"""
import asyncio
import math
import time
from datetime import datetime, timezone

from supabase import Client

# tau (seconds): at t=tau progress reaches ~63%; at 2*tau, ~87%; at 3*tau, ~95%
# Calibrated so the bar reaches ~80% around average job time for each mode.
TAU: dict[str, float] = {
    "generate": 7.0,    # FLUX 1.1 Pro ~20s avg
    "edit": 10.0,       # FLUX Kontext Pro ~30s avg
    "multi_ref": 12.0,  # FLUX 2 Pro ~35s avg
    "video": 50.0,      # Kling v2.1 ~150s avg
}


def _stage_label(pct: int, rep_status: str | None = None) -> str:
    if rep_status == "starting" or pct < 12:
        return "Queuing..."
    if pct < 55:
        return "Generating..."
    if pct < 80:
        return "Processing..."
    return "Almost done..."


async def update_progress(
    sb: Client, generation_id: str, pct: int, stage: str, status: str = "processing"
) -> None:
    sb.table("generation_progress").update(
        {"status": status, "progress_pct": pct, "stage": stage}
    ).eq("generation_id", generation_id).execute()


async def decay_progress(sb: Client, generation_id: str, mode: str) -> None:
    """
    Continuously update progress using exponential decay until the task is cancelled.
    Call asyncio.create_task(decay_progress(...)) before starting the model call,
    then cancel the task after the model returns.
    """
    tau = TAU.get(mode, 10.0)
    start = time.monotonic()
    last_pct = -1

    while True:
        await asyncio.sleep(1.0)
        elapsed = time.monotonic() - start
        pct = min(95, int((1 - math.exp(-elapsed / tau)) * 100))

        if pct != last_pct:
            stage = _stage_label(pct)
            await update_progress(sb, generation_id, pct, stage)
            last_pct = pct


async def run_prediction_with_progress(
    sb: Client,
    gen_id: str,
    mode: str,
    model_ref: str,
    model_input: dict,
) -> str:
    """
    Create a Replicate prediction, poll its status, and update DB progress with
    exponential decay + real Replicate state (starting / processing / succeeded).

    Returns the output URL string on success, raises RuntimeError on failure.
    """
    import replicate

    tau = TAU.get(mode, 10.0)

    # Create prediction (non-blocking via thread pool)
    prediction = await asyncio.to_thread(
        replicate.predictions.create,
        model=model_ref,
        input=model_input,
    )

    start = time.monotonic()
    last_pct = -1

    while True:
        await asyncio.sleep(1.5)

        # Refresh status from Replicate
        await asyncio.to_thread(prediction.reload)
        rep_status: str = prediction.status  # starting | processing | succeeded | failed | canceled

        elapsed = time.monotonic() - start
        raw_pct = int((1 - math.exp(-elapsed / tau)) * 100)

        # Cap at 15% while Replicate is still queuing
        if rep_status == "starting":
            pct = min(15, raw_pct)
        else:
            pct = min(95, raw_pct)

        stage = _stage_label(pct, rep_status if rep_status == "starting" else None)

        if pct != last_pct:
            await update_progress(sb, gen_id, pct, stage)
            last_pct = pct

        if rep_status == "succeeded":
            output = prediction.output
            if isinstance(output, list):
                return output[0] if output else ""
            return str(output) if output else ""

        if rep_status in ("failed", "canceled"):
            raise RuntimeError(str(prediction.error or "Generation failed"))


async def mark_complete(sb: Client, generation_id: str) -> None:
    sb.table("generation_progress").update(
        {
            "status": "completed",
            "progress_pct": 100,
            "stage": "Complete",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("generation_id", generation_id).execute()


async def mark_failed(sb: Client, generation_id: str, error: str) -> None:
    sb.table("generation_progress").update(
        {"status": "failed", "stage": "Error", "error_message": error}
    ).eq("generation_id", generation_id).execute()
