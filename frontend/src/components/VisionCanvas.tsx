import { useEffect, useRef } from "react";

/** The pixel buffer the vision run produced, ready to paint (canvas ImageData layout). */
export interface VisionFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface Props {
  /** The current frame to display, or null before the program has shown one. */
  frame: VisionFrame | null;
  /** The sample image path the lesson looks at, shown as a hint before running. */
  sampleImage?: string;
}

// The camera pane paints REAL pixels: whatever the learner's cv2 code handed to
// cv2.imshow() (the decoded photo, a grayscale conversion, a colour mask, ...).
// The frame is drawn 1:1 into an offscreen canvas and then blown up with
// smoothing off, so each pixel stays a crisp square — you can see the grid the
// algorithms actually operate on. Nothing here reads engine or LED state.
export default function VisionCanvas({ frame, sampleImage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // The visible canvas keeps the frame's aspect ratio, scaled to a comfortable
    // size; nearest-neighbour keeps pixels sharp rather than blurring them.
    const scale = Math.max(1, Math.floor(480 / frame.width));
    const dispW = frame.width * scale;
    const dispH = frame.height * scale;
    canvas.width = dispW;
    canvas.height = dispH;

    const off = document.createElement("canvas");
    off.width = frame.width;
    off.height = frame.height;
    const octx = off.getContext("2d");
    if (!octx) return;
    octx.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, dispW, dispH);
    ctx.drawImage(off, 0, 0, dispW, dispH);
  }, [frame]);

  return (
    <div className="vision-view">
      {frame ? (
        <canvas ref={canvasRef} className="vision-canvas" />
      ) : (
        <div className="vision-placeholder">
          <span className="vision-eye">👁</span>
          <p>
            The camera is looking at <code>{sampleImage ?? "the scene"}</code>.
          </p>
          <p className="vision-hint">
            Run your program — <code>cv2.imshow(...)</code> paints the real pixels here.
          </p>
        </div>
      )}
    </div>
  );
}
