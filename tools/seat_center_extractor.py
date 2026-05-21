#!/usr/bin/env python3
"""Extract per-seat center coordinates from a seating-chart image.

This tool is deliberately separate from the BookingWang UI. It takes an image
and an existing seat-id seed table, then measures each seat's local colored
component to produce a center-coordinate table and an overlay QA image.

The seed table supplies only identity/order and a rough search location. The
output center and box are measured from image pixels.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageDraw


@dataclass(frozen=True)
class ExtractedSeat:
    seat_id: str
    section_id: str
    section_name: str
    number: int
    x: float
    y: float
    width: float
    height: float
    source_x: float
    source_y: float
    confidence: float
    method: str
    pixel_count: int
    wheelchair: bool


def load_seed_ts(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"const\s+\w+\s*=\s*(\[.*?\])\s*\n\s*\n\s*export\s+default", text, re.S)
    if not match:
        raise ValueError(f"Could not locate exported seat array in {path}")
    return json.loads(match.group(1))


def color_mask(image_bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    # Seats are the saturated colored elements. This intentionally excludes
    # black text/gray outlines/background while preserving red/blue/green seats.
    # Some printed seats are pastel and lose saturation after JPEG/upscaling, so
    # keep the threshold lower than the global connected-component pass. The
    # per-seat local search window prevents most text/background pickup.
    mask = ((hsv[:, :, 1] > 32) & (hsv[:, :, 2] > 65) & (hsv[:, :, 2] < 253)).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8), iterations=1)
    return mask


def choose_component(mask_window: np.ndarray, seed_x: float, seed_y: float, x0: int, y0: int) -> tuple[np.ndarray | None, float]:
    num, labels, stats, centroids = cv2.connectedComponentsWithStats(mask_window, 8)
    best_label: int | None = None
    best_score = float("inf")
    for label in range(1, num):
        x, y, w, h, area = stats[label]
        if area < 4:
            continue
        cx, cy = centroids[label]
        gx = x0 + cx
        gy = y0 + cy
        distance = float(np.hypot(gx - seed_x, gy - seed_y))
        # Prefer components near the seed, but penalize very broad merged blobs.
        score = distance + max(0, w - 34) * 0.35 + max(0, h - 34) * 0.35
        if score < best_score:
            best_score = score
            best_label = label
    if best_label is None:
        return None, 0.0
    return (labels == best_label), best_score


def extract_one(mask: np.ndarray, seed: dict[str, Any], scale_x: float, scale_y: float) -> ExtractedSeat:
    sx = float(seed["x"]) * scale_x
    sy = float(seed["y"]) * scale_y
    expected_w = max(float(seed.get("width", 11)) * scale_x, 8)
    expected_h = max(float(seed.get("height", 11)) * scale_y, 8)

    height, width = mask.shape
    chosen: np.ndarray | None = None
    chosen_origin = (0, 0)
    method = "fallback"
    confidence = 0.0

    for radius in (10, 14, 18, 24, 32, 44):
        rx = int(max(radius * scale_x, expected_w * 1.25))
        ry = int(max(radius * scale_y, expected_h * 1.25))
        x0 = max(0, int(round(sx - rx)))
        x1 = min(width, int(round(sx + rx + 1)))
        y0 = max(0, int(round(sy - ry)))
        y1 = min(height, int(round(sy + ry + 1)))
        window = mask[y0:y1, x0:x1]
        component, score = choose_component(window, sx, sy, x0, y0)
        if component is not None and int(component.sum()) >= 5:
            chosen = component
            chosen_origin = (x0, y0)
            method = f"component-r{radius}"
            confidence = max(0.0, min(1.0, 1.0 - score / max(rx, ry, 1)))
            break

    if chosen is None:
        return ExtractedSeat(
            seat_id=seed["seatId"],
            section_id=seed["sectionId"],
            section_name=seed["sectionName"],
            number=int(seed["number"]),
            x=float(seed["x"]),
            y=float(seed["y"]),
            width=float(seed.get("width", 11)),
            height=float(seed.get("height", 11)),
            source_x=float(seed["x"]),
            source_y=float(seed["y"]),
            confidence=0.0,
            method=method,
            pixel_count=0,
            wheelchair=bool(seed.get("wheelchair", False)),
        )

    ys, xs = np.nonzero(chosen)
    x0, y0 = chosen_origin
    global_x = xs.astype(float) + x0
    global_y = ys.astype(float) + y0
    center_x = float(global_x.mean() / scale_x)
    center_y = float(global_y.mean() / scale_y)
    box_w = max(4.0, float((global_x.max() - global_x.min() + 1) / scale_x))
    box_h = max(4.0, float((global_y.max() - global_y.min() + 1) / scale_y))

    return ExtractedSeat(
        seat_id=seed["seatId"],
        section_id=seed["sectionId"],
        section_name=seed["sectionName"],
        number=int(seed["number"]),
        x=round(center_x, 2),
        y=round(center_y, 2),
        width=round(box_w, 2),
        height=round(box_h, 2),
        source_x=float(seed["x"]),
        source_y=float(seed["y"]),
        confidence=round(confidence, 3),
        method=method,
        pixel_count=int(chosen.sum()),
        wheelchair=bool(seed.get("wheelchair", False)),
    )


def seat_to_json(seat: ExtractedSeat) -> dict[str, Any]:
    return {
        "seatId": seat.seat_id,
        "sectionId": seat.section_id,
        "sectionName": seat.section_name,
        "number": seat.number,
        "x": seat.x,
        "y": seat.y,
        "width": seat.width,
        "height": seat.height,
        "sourceX": seat.source_x,
        "sourceY": seat.source_y,
        "confidence": seat.confidence,
        "method": seat.method,
        "pixelCount": seat.pixel_count,
        "wheelchair": seat.wheelchair,
    }


def write_outputs(seats: list[ExtractedSeat], json_output: Path, csv_output: Path) -> None:
    json_output.parent.mkdir(parents=True, exist_ok=True)
    json_output.write_text(json.dumps([seat_to_json(seat) for seat in seats], ensure_ascii=False, indent=2), encoding="utf-8")

    csv_output.parent.mkdir(parents=True, exist_ok=True)
    with csv_output.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(seat_to_json(seats[0]).keys()))
        writer.writeheader()
        for seat in seats:
            writer.writerow(seat_to_json(seat))


def write_ts(seats: list[ExtractedSeat], output: Path) -> None:
    rows = [
        {
            "seatId": seat.seat_id,
            "sectionId": seat.section_id,
            "sectionName": seat.section_name,
            "number": seat.number,
            "x": seat.x,
            "y": seat.y,
            "width": seat.width,
            "height": seat.height,
            "wheelchair": seat.wheelchair,
        }
        for seat in seats
    ]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "const extractedSeats = "
        + json.dumps(rows, ensure_ascii=False, indent=2)
        + "\n\nexport default extractedSeats\n",
        encoding="utf-8",
    )


def draw_overlay(image_path: Path, seats: list[ExtractedSeat], output: Path, view_width: int, view_height: int) -> None:
    image = Image.open(image_path).convert("RGBA")
    sx = image.width / view_width
    sy = image.height / view_height
    draw = ImageDraw.Draw(image, "RGBA")
    for seat in seats:
        x = seat.x * sx
        y = seat.y * sy
        w = max(6, seat.width * sx)
        h = max(6, seat.height * sy)
        color = (255, 0, 0, 120)
        if seat.section_id.startswith("2"):
            color = (0, 255, 100, 120)
        elif seat.section_id.startswith("O"):
            color = (0, 180, 255, 130)
        elif seat.section_id in {"1D", "1E"}:
            color = (255, 180, 0, 135)
        if seat.confidence < 0.35:
            color = (180, 0, 255, 155)
        draw.rounded_rectangle([x - w / 2, y - h / 2, x + w / 2, y + h / 2], radius=4, fill=color, outline=(0, 0, 0, 180), width=2)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def write_report(seats: list[ExtractedSeat], output: Path) -> None:
    by_section: dict[str, list[ExtractedSeat]] = {}
    for seat in seats:
        by_section.setdefault(seat.section_id, []).append(seat)
    report = {
        "total": len(seats),
        "fallbacks": sum(1 for seat in seats if seat.pixel_count == 0),
        "lowConfidence": sum(1 for seat in seats if seat.confidence < 0.35),
        "sections": {
            key: {
                "count": len(value),
                "fallbacks": sum(1 for seat in value if seat.pixel_count == 0),
                "lowConfidence": sum(1 for seat in value if seat.confidence < 0.35),
                "meanShiftX": round(float(np.mean([seat.x - seat.source_x for seat in value])), 3),
                "meanShiftY": round(float(np.mean([seat.y - seat.source_y for seat in value])), 3),
            }
            for key, value in by_section.items()
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=Path, default=Path("public/art315-seating-2x.jpg"))
    parser.add_argument("--seed-ts", type=Path, default=Path("src/generated/art315Seats.ts"))
    parser.add_argument("--view-width", type=int, default=1000)
    parser.add_argument("--view-height", type=int, default=1141)
    parser.add_argument("--json-output", type=Path, default=Path("../OpenClaw_Work_Artifacts/Bookingwang/seat-centers/art315-seat-centers.json"))
    parser.add_argument("--csv-output", type=Path, default=Path("../OpenClaw_Work_Artifacts/Bookingwang/seat-centers/art315-seat-centers.csv"))
    parser.add_argument("--overlay-output", type=Path, default=Path("../OpenClaw_Work_Artifacts/Bookingwang/seat-centers/art315-seat-centers-overlay.png"))
    parser.add_argument("--report-output", type=Path, default=Path("../OpenClaw_Work_Artifacts/Bookingwang/seat-centers/art315-seat-centers-report.json"))
    parser.add_argument("--ts-output", type=Path, help="Optional TypeScript output for direct service integration.")
    args = parser.parse_args()

    image_bgr = cv2.imread(str(args.image))
    if image_bgr is None:
        raise FileNotFoundError(args.image)

    scale_x = image_bgr.shape[1] / args.view_width
    scale_y = image_bgr.shape[0] / args.view_height
    mask = color_mask(image_bgr)
    seeds = load_seed_ts(args.seed_ts)
    seats = [extract_one(mask, seed, scale_x, scale_y) for seed in seeds]

    write_outputs(seats, args.json_output, args.csv_output)
    if args.ts_output:
        write_ts(seats, args.ts_output)
    write_report(seats, args.report_output)
    draw_overlay(args.image, seats, args.overlay_output, args.view_width, args.view_height)

    fallbacks = sum(1 for seat in seats if seat.pixel_count == 0)
    low_confidence = sum(1 for seat in seats if seat.confidence < 0.35)
    print(f"extracted={len(seats)} fallbacks={fallbacks} low_confidence={low_confidence}")
    print(args.json_output)
    print(args.csv_output)
    print(args.overlay_output)
    print(args.report_output)


if __name__ == "__main__":
    main()
