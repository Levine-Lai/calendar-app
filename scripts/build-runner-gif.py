"""Build a stable looping GIF from a generated runner sprite sheet."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


BACKGROUND = (190, 225, 248)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--columns", type=int, default=5)
    parser.add_argument("--rows", type=int, default=3)
    parser.add_argument("--duration", type=int, default=90, help="Milliseconds per frame")
    parser.add_argument(
        "--durations",
        help="Comma-separated per-frame durations in milliseconds; overrides --duration",
    )
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--head-width", type=int, default=172)
    parser.add_argument(
        "--auto-components",
        action="store_true",
        help="Detect each disconnected sprite instead of assuming equal grid cells",
    )
    parser.add_argument(
        "--keep-disconnected",
        action="store_true",
        help="Keep guides such as a disconnected ground baseline inside each cell",
    )
    return parser.parse_args()


def is_background(red: int, green: int, blue: int) -> bool:
    """Recognize the generated light-blue backdrop without erasing white clothing."""
    return (
        red >= 135
        and green >= 185
        and blue >= 225
        and blue >= green + 4
        and green >= red + 8
    )


def connected_components(alpha: Image.Image) -> list[list[tuple[int, int]]]:
    width, height = alpha.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components: list[list[tuple[int, int]]] = []

    for start_y in range(height):
        for start_x in range(width):
            index = start_y * width + start_x
            if visited[index] or pixels[start_x, start_y] == 0:
                continue
            visited[index] = 1
            stack = [(start_x, start_y)]
            component: list[tuple[int, int]] = []
            while stack:
                x, y = stack.pop()
                component.append((x, y))
                for next_x, next_y in (
                    (x - 1, y - 1),
                    (x, y - 1),
                    (x + 1, y - 1),
                    (x - 1, y),
                    (x + 1, y),
                    (x - 1, y + 1),
                    (x, y + 1),
                    (x + 1, y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if visited[next_index] or pixels[next_x, next_y] == 0:
                        continue
                    visited[next_index] = 1
                    stack.append((next_x, next_y))
            components.append(component)
    return components


def keep_largest_component(alpha: Image.Image) -> Image.Image:
    """Discard disconnected fragments from neighboring tightly packed sprite cells."""
    components = connected_components(alpha)
    largest = max(components, key=len, default=[])

    cleaned = Image.new("L", alpha.size)
    cleaned_pixels = cleaned.load()
    for x, y in largest:
        cleaned_pixels[x, y] = 255
    return cleaned


def auto_detect_cells(
    sheet: Image.Image,
    columns: int,
    rows: int,
) -> list[Image.Image]:
    rgba = sheet.convert("RGBA")
    alpha = Image.new("L", rgba.size)
    alpha.putdata(
        [
            0 if is_background(red, green, blue) else 255
            for red, green, blue, _ in rgba.get_flattened_data()
        ]
    )
    expected = columns * rows
    components = sorted(connected_components(alpha), key=len, reverse=True)[:expected]
    if len(components) != expected:
        raise ValueError(f"Expected {expected} sprites, detected {len(components)}")

    def bounds(component: list[tuple[int, int]]) -> tuple[int, int, int, int]:
        xs = [point[0] for point in component]
        ys = [point[1] for point in component]
        return min(xs), min(ys), max(xs) + 1, max(ys) + 1

    items = [(component, bounds(component)) for component in components]
    items.sort(key=lambda item: (item[1][1] + item[1][3]) / 2)
    ordered: list[tuple[list[tuple[int, int]], tuple[int, int, int, int]]] = []
    for row in range(rows):
        row_items = items[row * columns : (row + 1) * columns]
        row_items.sort(key=lambda item: (item[1][0] + item[1][2]) / 2)
        ordered.extend(row_items)

    cells: list[Image.Image] = []
    for component, (left, top, right, bottom) in ordered:
        width = right - left
        height = bottom - top
        cell = Image.new("RGB", (width, height), BACKGROUND)
        source_pixels = sheet.load()
        cell_pixels = cell.load()
        for x, y in component:
            cell_pixels[x - left, y - top] = source_pixels[x, y]
        cells.append(cell)
    return cells


def extract_subject(
    cell: Image.Image,
    keep_disconnected: bool = False,
) -> tuple[Image.Image, float, int]:
    rgba = cell.convert("RGBA")
    alpha = Image.new("L", rgba.size)
    alpha.putdata(
        [
            0 if is_background(red, green, blue) else 255
            for red, green, blue, _ in rgba.get_flattened_data()
        ]
    )
    if keep_disconnected:
        components = sorted(connected_components(alpha), key=len, reverse=True)
        kept_components = components[:1]
        for component in components[1:]:
            xs = [point[0] for point in component]
            ys = [point[1] for point in component]
            component_width = max(xs) - min(xs) + 1
            component_height = max(ys) - min(ys) + 1
            if (
                component_width >= alpha.width * 0.45
                and component_height <= max(6, alpha.height * 0.03)
            ):
                kept_components.append(component)
                break
        cleaned = Image.new("L", alpha.size)
        cleaned_pixels = cleaned.load()
        for component in kept_components:
            for x, y in component:
                cleaned_pixels[x, y] = 255
        alpha = cleaned
    else:
        alpha = keep_largest_component(alpha)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("No runner pixels found in sprite cell")

    rgba.putalpha(alpha)
    subject = rgba.crop(bbox)
    subject_alpha = subject.getchannel("A")
    head_band_height = max(1, round(subject.height * 0.34))
    head_band = subject_alpha.crop((0, 0, subject.width, head_band_height))
    head_bbox = head_band.getbbox()
    if head_bbox is None:
        head_center_x = subject.width / 2
    else:
        head_center_x = (head_bbox[0] + head_bbox[2]) / 2
    head_width = head_bbox[2] - head_bbox[0] if head_bbox is not None else subject.width
    return subject, head_center_x, head_width


def normalize_frame(
    cell: Image.Image,
    output_size: int,
    target_head_width: int,
    keep_disconnected: bool = False,
) -> Image.Image:
    subject, head_center_x, head_width = extract_subject(cell, keep_disconnected)
    scale = target_head_width / head_width
    resized_size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = subject.resize(resized_size, Image.Resampling.NEAREST)
    head_center_x *= scale

    canvas = Image.new("RGBA", (output_size, output_size), (*BACKGROUND, 255))
    left = round(output_size / 2 - head_center_x)
    top = round(output_size * 0.065)
    canvas.alpha_composite(subject, (left, top))
    return canvas.convert("RGB")


def main() -> None:
    args = parse_args()
    sheet = Image.open(args.source).convert("RGB")
    frames: list[Image.Image] = []

    if args.auto_components:
        cells = auto_detect_cells(sheet, args.columns, args.rows)
    else:
        cells = []
        for row in range(args.rows):
            for column in range(args.columns):
                left = round(column * sheet.width / args.columns)
                top = round(row * sheet.height / args.rows)
                right = round((column + 1) * sheet.width / args.columns)
                bottom = round((row + 1) * sheet.height / args.rows)
                cells.append(sheet.crop((left, top, right, bottom)))

    for cell in cells:
        frames.append(
            normalize_frame(
                cell,
                args.size,
                args.head_width,
                args.keep_disconnected,
            )
        )

    if args.durations:
        durations = [int(value.strip()) for value in args.durations.split(",")]
        if len(durations) != len(frames):
            raise ValueError(
                f"Expected {len(frames)} frame durations, received {len(durations)}"
            )
    else:
        durations = [args.duration] * len(frames)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        args.output,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=True,
    )
    print(
        f"Created {args.output} ({len(frames)} distinct frames, "
        f"{args.size}x{args.size}, {sum(durations)} ms/cycle)"
    )


if __name__ == "__main__":
    main()
