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

export interface Blob {
  area: number;
  m00: number;
  m10: number;
  m01: number;
  x: number;
  y: number;
  width: number;
  height: number;
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

/** Build a repeatable two-colour test scene from its real RGBA pixel buffer. */
export function makeBallScene(redX: number): Frame {
  const frame = makeFrame(240, 160, [40, 40, 40, 255]);
  drawDisk(frame, redX, 80, 20, [220, 40, 40, 255]);
  drawDisk(frame, 25, 80, 7, [220, 40, 40, 255]);
  drawDisk(frame, 220, 80, 12, [40, 80, 220, 255]);
  return frame;
}

function drawDisk(
  frame: Frame,
  cx: number,
  cy: number,
  radius: number,
  rgba: [number, number, number, number],
): void {
  for (let y = Math.max(0, cy - radius); y <= Math.min(frame.height - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(frame.width - 1, cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
      frame.data.set(rgba, (y * frame.width + x) * 4);
    }
  }
}

/** A deep copy for CV operations that return a new image. */
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

/** cv2.threshold(..., THRESH_BINARY): compare each gray pixel with the cutoff. */
export function threshold(f: Frame, cutoff: number, maxValue: number): Frame {
  const out = new Uint8ClampedArray(f.data.length);
  for (let i = 0; i < f.data.length; i += 4) {
    const value = f.data[i] > cutoff ? maxValue : 0;
    out[i] = value;
    out[i + 1] = value;
    out[i + 2] = value;
    out[i + 3] = 255;
  }
  return { width: f.width, height: f.height, data: out };
}

/** cv2.boundingRect(mask): return the smallest inclusive pixel bounds of nonzero data. */
export function boundingRect(f: Frame): [number, number, number, number] {
  let left = f.width;
  let top = f.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      if (f.data[(y * f.width + x) * 4] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left || bottom < top
    ? [0, 0, 0, 0]
    : [left, top, right - left + 1, bottom - top + 1];
}

/** Draw a BGR rectangle into the frame, matching cv2.rectangle's in-place effect. */
export function drawRectangle(
  f: Frame,
  topLeft: [number, number],
  bottomRight: [number, number],
  color: [number, number, number],
  thickness: number,
): void {
  const x0 = Math.min(topLeft[0], bottomRight[0]);
  const y0 = Math.min(topLeft[1], bottomRight[1]);
  const x1 = Math.max(topLeft[0], bottomRight[0]);
  const y1 = Math.max(topLeft[1], bottomRight[1]);
  const [b, g, r] = color;
  const fill = thickness < 0;
  const lineWidth = Math.max(1, thickness);
  const startX = Math.max(0, Math.min(x0, x1));
  const endX = Math.min(f.width - 1, Math.max(x0, x1));
  const startY = Math.max(0, Math.min(y0, y1));
  const endY = Math.min(f.height - 1, Math.max(y0, y1));

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      if (
        !fill &&
        x - x0 >= lineWidth &&
        x1 - x >= lineWidth &&
        y - y0 >= lineWidth &&
        y1 - y >= lineWidth
      )
        continue;
      const i = (y * f.width + x) * 4;
      f.data[i] = r;
      f.data[i + 1] = g;
      f.data[i + 2] = b;
      f.data[i + 3] = 255;
    }
  }
}

/** Return each 8-connected nonzero region and its exact pixel moments. */
export function findBlobs(frame: Frame): Blob[] {
  const visited = new Uint8Array(frame.width * frame.height);
  const blobs: Blob[] = [];
  const neighbours: [number, number][] = [
    [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];

  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const first = y * frame.width + x;
      if (visited[first] || frame.data[first * 4] === 0) continue;
      const pending = [first];
      visited[first] = 1;
      let area = 0;
      let m10 = 0;
      let m01 = 0;
      let left = x;
      let top = y;
      let right = x;
      let bottom = y;

      while (pending.length > 0) {
        const index = pending.pop()!;
        const px = index % frame.width;
        const py = Math.floor(index / frame.width);
        area++;
        m10 += px;
        m01 += py;
        left = Math.min(left, px);
        top = Math.min(top, py);
        right = Math.max(right, px);
        bottom = Math.max(bottom, py);

        for (const [dx, dy] of neighbours) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || nx >= frame.width || ny < 0 || ny >= frame.height) continue;
          const next = ny * frame.width + nx;
          if (visited[next] || frame.data[next * 4] === 0) continue;
          visited[next] = 1;
          pending.push(next);
        }
      }

      blobs.push({
        area,
        m00: area,
        m10,
        m01,
        x: left,
        y: top,
        width: right - left + 1,
        height: bottom - top + 1,
      });
    }
  }
  return blobs;
}

/** Draw a BGR circle into a frame; negative thickness fills the disk. */
export function drawCircle(
  frame: Frame,
  center: [number, number],
  radius: number,
  color: [number, number, number],
  thickness: number,
): void {
  const [cx, cy] = center;
  const [b, g, r] = color;
  const outerRadius = radius ** 2;
  const innerRadius = thickness < 0 ? -1 : Math.max(0, radius - thickness) ** 2;
  for (let y = Math.max(0, cy - radius); y <= Math.min(frame.height - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(frame.width - 1, cx + radius); x++) {
      const distance = (x - cx) ** 2 + (y - cy) ** 2;
      if (distance > outerRadius || (innerRadius >= 0 && distance < innerRadius)) continue;
      const i = (y * frame.width + x) * 4;
      frame.data[i] = r;
      frame.data[i + 1] = g;
      frame.data[i + 2] = b;
      frame.data[i + 3] = 255;
    }
  }
}
