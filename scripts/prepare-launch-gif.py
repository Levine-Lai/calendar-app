"""Trim an animated GIF to an exact launch-screen duration."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--duration", type=int, default=3000, help="Target duration in ms")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    image = Image.open(args.source)
    frames: list[Image.Image] = []
    durations: list[int] = []
    elapsed = 0

    for index in range(getattr(image, "n_frames", 1)):
        if elapsed >= args.duration:
            break
        image.seek(index)
        frame_duration = int(image.info.get("duration", 80))
        remaining = args.duration - elapsed
        durations.append(min(frame_duration, remaining))
        frames.append(image.convert("RGBA").copy())
        elapsed += durations[-1]

    if not frames or elapsed != args.duration:
        raise ValueError(f"Unable to create an exact {args.duration} ms animation")

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
        f"Created {args.output} ({len(frames)} frames, "
        f"{sum(durations)} ms, {frames[0].width}x{frames[0].height})"
    )


if __name__ == "__main__":
    main()
