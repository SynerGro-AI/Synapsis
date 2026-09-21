// Pure, deterministic computer-vision primitives over REAL pixels.
//
// This is the honest core of the vision lessons: every operation here genuinely
// reads and computes from a frame's pixel buffer — grayscale is the real
// luminance of each pixel, a colour mask is each pixel truly tested against a
// range. Nothing is faked and nothing is read back from engine/LED state. The
// learner's cv2 code (see python.ts) calls straight through to these functions,
// and the Node verification harness runs the identical functions on
// procedurally-built frames with known ground truth — so what the browser paints
// and what the harness asserts are computed the same way.
//
// A Frame is an RGBA pixel buffer, 4 bytes per pixel, row-major — the exact
// layout of a canvas ImageData, so the app can hand decoded photos in and draw
// results straight back out with no conversion. OpenCV is natively BGR, so the
// cv2-facing ordering (e.g. inRange bounds) is [B, G, R]; we read the true R/G/B
// out of the RGBA buffer and compare in that order, matching real cv2 semantics.

export interface Frame {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major (identical to canvas ImageData.data). */
  data: Uint8ClampedArray;
}

/** A fresh frame filled with one RGBA colour (default opaque black). */
export function makeFrame(
  width: number,
  height: number,
  fill: [number, number, number, number] = [0, 0, 0, 255],
): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return { width, height, data };
}

/** A deep copy — CV ops never mutate their input, exactly like cv2. */
export function cloneFrame(f: Frame): Frame {
  return { width: f.width, height: f.height, data: new Uint8ClampedArray(f.data) };
}

// OpenCV's COLOR_BGR2GRAY / COLOR_RGB2GRAY luminance weights. Applied to the true
// R, G, B of each pixel, so the number is the genuine perceived brightness.
const GRAY_R = 0.299;
const GRAY_G = 0.587;
const GRAY_B = 0.114;

/** The luminance of one RGB pixel, 0–255, rounded like cv2's 8-bit conversion. */
export function luminance(r: number, g: number, b: number): number {
  return Math.round(GRAY_R * r + GRAY_G * g + GRAY_B * b);
}

/**
 * cv2.cvtColor(img, COLOR_BGR2GRAY): compute each pixel's real luminance and
 * write it to R = G = B so the result is a true gray image that still displays.
 */
export function toGray(f: Frame): Frame {
  const out = new Uint8ClampedArray(f.data.length);
  for (let i = 0; i < f.data.length; i += 4) {
    const y = luminance(f.data[i], f.data[i + 1], f.data[i + 2]);
    out[i] = y;
    out[i + 1] = y;
    out[i + 2] = y;
    out[i + 3] = 255;
  }
  return { width: f.width, height: f.height, data: out };
}

/**
 * cv2.inRange(img, lower, upper): per-pixel colour test. Bounds are OpenCV order
 * [B, G, R]. Every pixel whose B, G and R all fall within [lower, upper] becomes
 * white (255); every other pixel becomes black (0). The result is a real binary
 * mask — the substance of colour detection.
 */
export function inRange(
  f: Frame,
  lower: [number, number, number],
  upper: [number, number, number],
): Frame {
  const [loB, loG, loR] = lower;
  const [hiB, hiG, hiR] = upper;
  const out = new Uint8ClampedArray(f.data.length);
  for (let i = 0; i < f.data.length; i += 4) {
    const r = f.data[i];
    const g = f.data[i + 1];
    const b = f.data[i + 2];
    const on = b >= loB && b <= hiB && g >= loG && g <= hiG && r >= loR && r <= hiR;
    const v = on ? 255 : 0;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return { width: f.width, height: f.height, data: out };
}

/** Count the lit (non-black) pixels of a mask — genuine per-pixel tally. */
export function countNonZero(f: Frame): number {
  let n = 0;
  for (let i = 0; i < f.data.length; i += 4) {
    if (f.data[i] > 0) n++;
  }
  return n;
}
