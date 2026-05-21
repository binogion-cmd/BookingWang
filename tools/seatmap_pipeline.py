#!/usr/bin/env python3
"""Generate BookingWang seat coordinates from a seating-chart image.

This is intentionally deterministic. The LLM no longer hand-tunes every seat:
rough venue templates define the expected numbering pattern, and OpenCV scores
small x/y offsets against the colored seat pixels in the chart.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
from PIL import Image, ImageDraw


@dataclass(frozen=True)
class Seat:
    seat_id: str
    section_id: str
    section_name: str
    number: int
    x: float
    y: float
    width: float
    height: float
    wheelchair: bool = False


@dataclass(frozen=True)
class GridSpec:
    section_id: str
    section_name: str
    count: int
    x: float
    y: float
    dx: float
    dy: float
    columns: int
    width: float = 11
    height: float = 11
    wheelchair_from: int | None = None


@dataclass(frozen=True)
class SegmentSpec:
    count: int
    columns: int
    x: float
    y: float
    dx: float
    dy: float


def seat_id(section_id: str, number: int) -> str:
    return f"{section_id}-{number:03d}"


def grid(spec: GridSpec, offset_x: float = 0, offset_y: float = 0) -> list[Seat]:
    seats: list[Seat] = []
    for first in range(1, spec.count + 1, spec.columns):
        row_index = (first - 1) // spec.columns
        row = list(range(first, min(first + spec.columns, spec.count + 1)))
        visual_row = row if row_index % 2 == 0 else list(reversed(row))
        for visual_index, number in enumerate(visual_row):
            seats.append(
                Seat(
                    seat_id(spec.section_id, number),
                    spec.section_id,
                    spec.section_name,
                    number,
                    spec.x + offset_x + visual_index * spec.dx,
                    spec.y + offset_y + row_index * spec.dy,
                    spec.width,
                    spec.height,
                    spec.wheelchair_from is not None and number >= spec.wheelchair_from,
                )
            )
    return seats


def segment_table(
    section_id: str,
    section_name: str,
    segments: Iterable[SegmentSpec],
    wheelchair_from: int | None = None,
    offset_x: float = 0,
    offset_y: float = 0,
) -> list[Seat]:
    seats: list[Seat] = []
    cursor = 1
    for segment in segments:
        end = cursor + segment.count
        for first in range(cursor, end, segment.columns):
            row_index = (first - cursor) // segment.columns
            row = list(range(first, min(first + segment.columns, end)))
            visual_row = row if row_index % 2 == 0 else list(reversed(row))
            for visual_index, number in enumerate(visual_row):
                seats.append(
                    Seat(
                        seat_id(section_id, number),
                        section_id,
                        section_name,
                        number,
                        segment.x + offset_x + visual_index * segment.dx,
                        segment.y + offset_y + row_index * segment.dy,
                        11,
                        11,
                        wheelchair_from is not None and number >= wheelchair_from,
                    )
                )
        cursor = end
    return seats


def art315_side(section_id: str, section_name: str, x: float, offset_x: float = 0, offset_y: float = 0) -> list[Seat]:
    seats: list[Seat] = []
    for index in range(12):
        y = 531 + index * 22 if index < 3 else 660 + (index - 3) * 17.5
        seats.append(Seat(seat_id(section_id, index + 1), section_id, section_name, index + 1, x + offset_x, y + offset_y, 11, 13))
    return seats


def color_mask(image_path: Path) -> np.ndarray:
    image = cv2.imread(str(image_path))
    if image is None:
        raise FileNotFoundError(image_path)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    mask = ((hsv[:, :, 1] > 22) & (hsv[:, :, 2] > 80) & (hsv[:, :, 2] < 252)).astype(np.uint8)
    return cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)


def overlap_score(mask: np.ndarray, seats: Iterable[Seat], offset_x: float, offset_y: float) -> float:
    height, width = mask.shape
    values: list[float] = []
    for seat in seats:
        x1 = max(0, round(seat.x + offset_x - seat.width / 2))
        x2 = min(width, round(seat.x + offset_x + seat.width / 2))
        y1 = max(0, round(seat.y + offset_y - seat.height / 2))
        y2 = min(height, round(seat.y + offset_y + seat.height / 2))
        if x2 <= x1 or y2 <= y1:
            continue
        values.append(float(mask[y1:y2, x1:x2].mean()))
    return float(np.mean(values)) if values else 0


def optimize_offset(mask: np.ndarray, seats: list[Seat], radius: int = 14) -> tuple[int, int, float]:
    best = (0, 0, overlap_score(mask, seats, 0, 0))
    for offset_x in range(-radius, radius + 1):
        for offset_y in range(-radius, radius + 1):
            score = overlap_score(mask, seats, offset_x, offset_y)
            if score > best[2]:
                best = (offset_x, offset_y, score)
    return best


# These offsets are calibrated against the 3.15 Art Center source image and the
# browser-rendered overlay. The raw OpenCV optimizer is kept as diagnostics, but
# unconstrained per-block maxima can drift a section away from the visual chart.
CALIBRATED_OFFSETS: dict[str, tuple[int, int]] = {
    "O-L": (0, 0),
    "O-C": (0, 0),
    "O-R": (0, 0),
    "1A": (12, -5),
    "1B": (-2, -4),
    "1C": (-12, -5),
    "1D": (0, 0),
    "1E": (0, 0),
    "2A": (-1, 0),
    "2B": (2, 0),
    "2C": (-1, 0),
}


def art315_specs() -> dict[str, list[Seat]]:
    return {
        "O-L": grid(GridSpec("O-L", "오케스트라박스 좌측", 16, 238, 168, 14.5, 17, 8, 11, 10)),
        "O-C": grid(GridSpec("O-C", "오케스트라박스 중앙", 20, 390, 168, 14.5, 17, 10, 11, 10)),
        "O-R": grid(GridSpec("O-R", "오케스트라박스 우측", 18, 642, 168, 14.5, 17, 9, 11, 10)),
        "1A": segment_table(
            "1A",
            "1층 A열",
            [SegmentSpec(131, 14, 194, 334, 12.3, 16.5), SegmentSpec(150, 15, 192, 533, 11.5, 16.5)],
            wheelchair_from=270,
        ),
        "1B": segment_table(
            "1B",
            "1층 B열",
            [SegmentSpec(140, 14, 397, 333, 14.3, 16.5), SegmentSpec(132, 14, 397, 532, 14.3, 16.5)],
            wheelchair_from=271,
        ),
        "1C": segment_table(
            "1C",
            "1층 C열",
            [SegmentSpec(131, 14, 632, 334, 12.3, 16.5), SegmentSpec(150, 15, 632, 533, 11.5, 16.5)],
            wheelchair_from=270,
        ),
        "1D": art315_side("1D", "1층 D열", 96),
        "1E": art315_side("1E", "1층 E열", 904),
        "2A": grid(GridSpec("2A", "2층 A열", 83, 180, 937, 12.8, 18, 14)),
        "2B": grid(GridSpec("2B", "2층 B열", 84, 397, 937, 14.4, 18, 14)),
        "2C": grid(GridSpec("2C", "2층 C열", 83, 628, 937, 12.8, 18, 14)),
    }


def seat_to_dict(seat: Seat) -> dict[str, object]:
    return {
        "seatId": seat.seat_id,
        "sectionId": seat.section_id,
        "sectionName": seat.section_name,
        "number": seat.number,
        "x": round(seat.x, 2),
        "y": round(seat.y, 2),
        "width": seat.width,
        "height": seat.height,
        "wheelchair": seat.wheelchair,
    }


def write_ts(seats: list[Seat], output: Path) -> None:
    rows = json.dumps([seat_to_dict(seat) for seat in seats], ensure_ascii=False, indent=2)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(f"const art315Seats = {rows}\n\nexport default art315Seats\n", encoding="utf-8")


def draw_overlay(image_path: Path, seats: list[Seat], output: Path) -> None:
    image = Image.open(image_path).convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")
    for seat in seats:
        color = (255, 0, 0, 110)
        if seat.section_id.startswith("2"):
            color = (0, 255, 100, 110)
        elif seat.section_id.startswith("O"):
            color = (0, 180, 255, 115)
        elif seat.section_id in {"1D", "1E"}:
            color = (255, 180, 0, 125)
        draw.rounded_rectangle(
            [seat.x - seat.width / 2, seat.y - seat.height / 2, seat.x + seat.width / 2, seat.y + seat.height / 2],
            radius=2,
            fill=color,
            outline=(20, 20, 20, 180),
            width=1,
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def build_art315(image_path: Path, ts_output: Path, overlay_output: Path, report_output: Path, free_optimize: bool = False) -> None:
    mask = color_mask(image_path)
    optimized: list[Seat] = []
    report = []
    for key, base_seats in art315_specs().items():
        raw_offset_x, raw_offset_y, raw_score = optimize_offset(mask, base_seats)
        offset_x, offset_y = (raw_offset_x, raw_offset_y) if free_optimize else CALIBRATED_OFFSETS[key]
        score = overlap_score(mask, base_seats, offset_x, offset_y)
        moved = [
            Seat(
                seat.seat_id,
                seat.section_id,
                seat.section_name,
                seat.number,
                seat.x + offset_x,
                seat.y + offset_y,
                seat.width,
                seat.height,
                seat.wheelchair,
            )
            for seat in base_seats
        ]
        optimized.extend(moved)
        report.append(
            {
                "block": key,
                "offsetX": offset_x,
                "offsetY": offset_y,
                "score": round(score, 4),
                "rawOffsetX": raw_offset_x,
                "rawOffsetY": raw_offset_y,
                "rawScore": round(raw_score, 4),
                "seats": len(moved),
            }
        )

    write_ts(optimized, ts_output)
    draw_overlay(image_path, optimized, overlay_output)
    report_output.parent.mkdir(parents=True, exist_ok=True)
    report_output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--venue", default="art315", choices=["art315"])
    parser.add_argument("--image", type=Path, default=Path("public/art315-seating.jpg"))
    parser.add_argument("--ts-output", type=Path, default=Path("src/generated/art315Seats.ts"))
    parser.add_argument("--overlay-output", type=Path, default=Path("../OpenClaw_Work_Artifacts/Bookingwang/seatmap-pipeline/art315-overlay.png"))
    parser.add_argument("--report-output", type=Path, default=Path("../OpenClaw_Work_Artifacts/Bookingwang/seatmap-pipeline/art315-report.json"))
    parser.add_argument("--free-optimize", action="store_true", help="Use unconstrained OpenCV offsets instead of calibrated production offsets.")
    args = parser.parse_args()

    build_art315(args.image, args.ts_output, args.overlay_output, args.report_output, args.free_optimize)


if __name__ == "__main__":
    main()
