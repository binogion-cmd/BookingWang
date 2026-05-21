#!/usr/bin/env python3
"""Extract 3.15 Art Center seats from the official Excel seating chart.

The XLS chart is a better source of truth than raster image recognition: every
seat number is already placed in a spreadsheet cell. This tool extracts those
cells into a canonical table and renders a QA image from the spreadsheet grid.
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont
import xlrd


@dataclass(frozen=True)
class XlsSeat:
    seat_id: str
    section_id: str
    section_name: str
    number: int
    row: int
    col: int
    x: float
    y: float
    width: float
    height: float


SECTION_RANGES = [
    # Orchestra pit. The official sheet numbers these 1-54 continuously.
    ("O-L", "오케스트라박스 좌측", 18, 19, 13, 20),
    ("O-C", "오케스트라박스 중앙", 18, 19, 23, 34),
    ("O-R", "오케스트라박스 우측", 18, 19, 37, 44),
    # 1F side and main blocks.
    ("1D", "1층 D열", 23, 44, 2, 2),
    ("1A", "1층 A열", 23, 44, 6, 20),
    ("1B", "1층 B열", 23, 44, 22, 35),
    ("1C", "1층 C열", 23, 44, 37, 51),
    ("1E", "1층 E열", 23, 44, 55, 55),
    # 2F.
    ("2A", "2층 A열", 57, 62, 7, 20),
    ("2B", "2층 B열", 57, 62, 22, 35),
    ("2C", "2층 C열", 57, 62, 37, 50),
]


def cell_number(value: Any) -> int | None:
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, int):
        return value
    return None


def default_col_width(sheet: xlrd.sheet.Sheet, col: int) -> float:
    info = sheet.colinfo_map.get(col)
    if info and info.width:
        return float(info.width)
    return 2560.0


def default_row_height(sheet: xlrd.sheet.Sheet, row: int) -> float:
    info = sheet.rowinfo_map.get(row)
    if info and info.height:
        return float(info.height)
    return 255.0


def cumulative_centers(sheet: xlrd.sheet.Sheet) -> tuple[list[float], list[float], list[float], list[float]]:
    col_widths = [default_col_width(sheet, col) for col in range(sheet.ncols)]
    row_heights = [default_row_height(sheet, row) for row in range(sheet.nrows)]
    col_left = [0.0]
    for width in col_widths[:-1]:
        col_left.append(col_left[-1] + width)
    row_top = [0.0]
    for height in row_heights[:-1]:
        row_top.append(row_top[-1] + height)
    col_centers = [left + width / 2 for left, width in zip(col_left, col_widths)]
    row_centers = [top + height / 2 for top, height in zip(row_top, row_heights)]
    return col_centers, row_centers, col_widths, row_heights


def extract_seats(xls_path: Path, sheet_name: str | None = None) -> list[XlsSeat]:
    book = xlrd.open_workbook(str(xls_path), formatting_info=True)
    sheet = book.sheet_by_name(sheet_name) if sheet_name else book.sheet_by_index(0)
    col_centers, row_centers, col_widths, row_heights = cumulative_centers(sheet)

    seats: list[XlsSeat] = []
    for section_id, section_name, r0, r1, c0, c1 in SECTION_RANGES:
        for row in range(r0, r1 + 1):
            for col in range(c0, c1 + 1):
                number = cell_number(sheet.cell_value(row, col))
                if number is None:
                    continue
                seats.append(
                    XlsSeat(
                        seat_id=f"{section_id}-{number:03d}",
                        section_id=section_id,
                        section_name=section_name,
                        number=number,
                        row=row,
                        col=col,
                        x=col_centers[col],
                        y=row_centers[row],
                        width=col_widths[col] * 0.82,
                        height=row_heights[row] * 0.82,
                    )
                )

    # Normalize spreadsheet units to a convenient 1000px-wide drawing plane.
    min_x = min(seat.x - seat.width / 2 for seat in seats)
    max_x = max(seat.x + seat.width / 2 for seat in seats)
    min_y = min(seat.y - seat.height / 2 for seat in seats)
    max_y = max(seat.y + seat.height / 2 for seat in seats)
    scale = 1000.0 / (max_x - min_x)
    normalized: list[XlsSeat] = []
    for seat in seats:
        normalized.append(
            XlsSeat(
                seat_id=seat.seat_id,
                section_id=seat.section_id,
                section_name=seat.section_name,
                number=seat.number,
                row=seat.row,
                col=seat.col,
                x=round((seat.x - min_x) * scale, 2),
                y=round((seat.y - min_y) * scale, 2),
                width=round(seat.width * scale, 2),
                height=round(seat.height * scale, 2),
            )
        )
    return normalized


def to_json(seat: XlsSeat) -> dict[str, Any]:
    return {
        "seatId": seat.seat_id,
        "sectionId": seat.section_id,
        "sectionName": seat.section_name,
        "number": seat.number,
        "row": seat.row,
        "col": seat.col,
        "x": seat.x,
        "y": seat.y,
        "width": seat.width,
        "height": seat.height,
    }


def write_json_csv(seats: list[XlsSeat], json_output: Path, csv_output: Path) -> None:
    json_output.parent.mkdir(parents=True, exist_ok=True)
    json_output.write_text(json.dumps([to_json(seat) for seat in seats], ensure_ascii=False, indent=2), encoding="utf-8")
    csv_output.parent.mkdir(parents=True, exist_ok=True)
    with csv_output.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(to_json(seats[0]).keys()))
        writer.writeheader()
        for seat in seats:
            writer.writerow(to_json(seat))


def write_ts(seats: list[XlsSeat], ts_output: Path) -> None:
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
            "wheelchair": False,
        }
        for seat in seats
    ]
    ts_output.parent.mkdir(parents=True, exist_ok=True)
    ts_output.write_text("const xlsSeats = " + json.dumps(rows, ensure_ascii=False, indent=2) + "\n\nexport default xlsSeats\n", encoding="utf-8")


def draw_qa(seats: list[XlsSeat], output: Path) -> None:
    min_x = min(seat.x - seat.width / 2 for seat in seats)
    max_x = max(seat.x + seat.width / 2 for seat in seats)
    min_y = min(seat.y - seat.height / 2 for seat in seats)
    max_y = max(seat.y + seat.height / 2 for seat in seats)
    pad = 40
    width = int(max_x - min_x + pad * 2)
    height = int(max_y - min_y + pad * 2)
    image = Image.new("RGB", (width, height), "#f8fafc")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 10)
        font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
    except Exception:
        font = font_title = None

    colors = {
        "O": "#00a6d6",
        "1": "#e5484d",
        "2": "#2fb344",
    }
    draw.text((pad, 10), "3.15 Art Center XLS seat extraction", fill="#17202a", font=font_title)
    for seat in seats:
        x = seat.x - min_x + pad
        y = seat.y - min_y + pad
        color = colors.get(seat.section_id[0], "#f0a202")
        if seat.section_id in {"1D", "1E"}:
            color = "#f0a202"
        draw.rounded_rectangle(
            [x - seat.width / 2, y - seat.height / 2, x + seat.width / 2, y + seat.height / 2],
            radius=3,
            fill=color,
            outline="#17202a",
            width=1,
        )
        if seat.width >= 12:
            draw.text((x - 5, y - 5), str(seat.number), fill="white", font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def write_report(seats: list[XlsSeat], report_output: Path) -> None:
    sections: dict[str, list[XlsSeat]] = {}
    for seat in seats:
        sections.setdefault(seat.section_id, []).append(seat)
    report = {
        "total": len(seats),
        "sections": {
            key: {
                "count": len(value),
                "minNumber": min(seat.number for seat in value),
                "maxNumber": max(seat.number for seat in value),
            }
            for key, value in sections.items()
        },
    }
    report_output.parent.mkdir(parents=True, exist_ok=True)
    report_output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xls", type=Path, required=True)
    parser.add_argument("--sheet", default=None)
    parser.add_argument("--json-output", type=Path, required=True)
    parser.add_argument("--csv-output", type=Path, required=True)
    parser.add_argument("--ts-output", type=Path)
    parser.add_argument("--qa-output", type=Path, required=True)
    parser.add_argument("--report-output", type=Path, required=True)
    args = parser.parse_args()

    seats = extract_seats(args.xls, args.sheet)
    write_json_csv(seats, args.json_output, args.csv_output)
    if args.ts_output:
        write_ts(seats, args.ts_output)
    draw_qa(seats, args.qa_output)
    write_report(seats, args.report_output)
    print(f"extracted={len(seats)}")
    print(args.report_output)
    print(args.qa_output)


if __name__ == "__main__":
    main()
