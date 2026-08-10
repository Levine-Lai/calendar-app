from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--fps", type=float, default=12.0)
    parser.add_argument("--size", type=int, default=512)
    return parser.parse_args()


def estimate_background(rgb: np.ndarray) -> np.ndarray:
    height, width = rgb.shape[:2]
    edge = max(24, min(height, width) // 14)
    corners = np.concatenate(
        [
            rgb[:edge, :edge].reshape(-1, 3),
            rgb[:edge, -edge:].reshape(-1, 3),
            rgb[-edge:, :edge].reshape(-1, 3),
            rgb[-edge:, -edge:].reshape(-1, 3),
        ]
    )
    return np.median(corners, axis=0).astype(np.float32)


def isolate_subject(bgr: np.ndarray) -> np.ndarray:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32)
    background = estimate_background(rgb)
    distance = np.linalg.norm(rgb - background, axis=2)
    blue_like = (
        (rgb[..., 2] >= rgb[..., 1] + 5)
        & (rgb[..., 1] >= rgb[..., 0] + 8)
    )

    # The watermark is disconnected from the runner. Keeping only the largest
    # non-blue component removes it regardless of which corner it moves to.
    core = ((distance >= 27) & ~blue_like).astype(np.uint8)
    core = cv2.morphologyEx(core, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(core, 8)
    if count <= 1:
        raise RuntimeError("No foreground subject detected")
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    subject = (labels == largest).astype(np.uint8)
    neighborhood = cv2.dilate(subject, np.ones((5, 5), np.uint8))

    # Turn the blue-screen distance into a soft edge and mathematically remove
    # the blue contribution from partially transparent edge pixels.
    alpha = np.clip((distance - 8.0) / 42.0, 0.0, 1.0) * neighborhood
    alpha[blue_like] = 0.0
    alpha[subject.astype(bool) & (distance >= 48)] = 1.0
    safe_alpha = np.maximum(alpha[..., None], 0.12)
    clean_rgb = background + (rgb - background) / safe_alpha
    clean_rgb = np.clip(clean_rgb, 0, 255).astype(np.uint8)
    clean_rgb[alpha <= 0] = 0
    return np.dstack((clean_rgb, np.round(alpha * 255).astype(np.uint8)))


def to_gif_frame(rgba: Image.Image) -> Image.Image:
    alpha = np.asarray(rgba.getchannel("A"))
    quantized = rgba.convert("RGB").quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    indices = np.asarray(quantized, dtype=np.uint16) + 1
    indices[alpha < 112] = 0
    frame = Image.fromarray(indices.astype(np.uint8), mode="P")
    palette = [0, 0, 0] + quantized.getpalette()[: 255 * 3]
    frame.putpalette(palette + [0] * (768 - len(palette)))
    frame.info["transparency"] = 0
    return frame


def main() -> None:
    args = parse_args()
    capture = cv2.VideoCapture(str(args.source))
    if not capture.isOpened():
        raise RuntimeError(f"Unable to open {args.source}")

    source_fps = capture.get(cv2.CAP_PROP_FPS) or 24.0
    sample_step = source_fps / args.fps
    next_sample = 0.0
    source_index = 0
    frames: list[Image.Image] = []
    while True:
        ok, bgr = capture.read()
        if not ok:
            break
        if source_index + 0.001 >= next_sample:
            rgba = Image.fromarray(isolate_subject(bgr), "RGBA")
            rgba = rgba.resize((args.size, args.size), Image.Resampling.LANCZOS)
            frames.append(to_gif_frame(rgba))
            next_sample += sample_step
        source_index += 1
    capture.release()

    if not frames:
        raise RuntimeError("No frames decoded")
    duration_ms = round(1000 / args.fps)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        args.output,
        save_all=True,
        append_images=frames[1:],
        duration=duration_ms,
        loop=0,
        disposal=2,
        transparency=0,
        optimize=False,
    )
    print(
        f"Created {args.output} ({len(frames)} frames, {args.size}x{args.size}, "
        f"{duration_ms} ms/frame)"
    )


if __name__ == "__main__":
    main()
