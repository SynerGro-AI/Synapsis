// One-shot, idempotent: add the AI track's first vision lessons (501-503) to the
// frontend data files, then mirror both to the backend copy. These are the VISION
// lessons (kind:"vision"): the learner writes PYTHON with OpenCV (cv2) that reads
// REAL pixels. cv2.imread() hands back the committed sample photo's decoded RGBA
// buffer (public/vision/scene.png), every cv2 operation genuinely computes over
// those bytes in src/sim/cv.ts, and cv2.imshow() paints the produced frame on the
// new VisionCanvas. Nothing is faked and nothing is read from engine/LED state —
// the vision only ever sees pixels.
//
// Staged shipping (matches the live-safe deploy cadence for the ai course):
//   node scripts/add-ai-vision.cjs            -> Deploy 1 (501-503: load/show, gray, mask)
//   node scripts/add-ai-vision.cjs 508         -> Deploy 2 (504-508, finish vision_setup)
//   node scripts/add-ai-vision.cjs 514         -> Deploy 3 (509-514)
//   node scripts/add-ai-vision.cjs 518         -> Deploy 4 (515-518 capstone + finalize)
// Re-running upserts, so it is always safe to run again.
//
// Authenticity is the hard rule. In 501 the pixels shown are the exact ones the
// PNG decoded to. In 502 the gray value of each pixel IS its luminance
// 0.299R+0.587G+0.114B — computed, not canned. In 503 the mask is white ONLY where
// a pixel's B, G and R all fall in [lower, upper]; the red ball lights because its
// real channels pass the test, the sky/grass/sun stay black because theirs don't.
// A missing image is honest None; an unsupported cv2.<x> raises a real error.
// Learner Python is 4-space PEP-8. One new idea per lesson, reusing the last.
const fs = require("fs");
const path = require("path");

const LIMIT = process.argv[2] ? Number(process.argv[2]) : 503;

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");

const lessonsPath = path.join(FE, "lessons.json");
const lessons = JSON.parse(fs.readFileSync(lessonsPath, "utf8"));

// ---- phases: the ai track's vision_setup + opencv scaffolds are `coming-soon`.
// Inserting lessons in their id range is what turns the track live (the UI derives
// "live" purely from lesson presence); we also drop the now-obsolete `status` flag
// for data hygiene. mediapipe/edge_infer stay untouched (still coming soon).
for (const id of ["vision_setup", "opencv"]) {
  const p = lessons.phases.find((x) => x.id === id);
  if (p) delete p.status;
}

const CREDIT =
  "Paul McWhorter, OpenCV with Python — toptechboy.com; support at patreon.com/PaulMcWhorter";

// A vision lesson: the learner types Python (codeTemplate) that reads real pixels
// via cv2. There is no circuit — the camera looks at a committed sample photo, so
// palette/required are empty and the featured part is the camera.
const lesson = (id, phase, title, description, notes, starter, hints, output) => ({
  id,
  phase,
  title,
  description,
  source: CREDIT,
  kind: "vision",
  vision: { scene: "photo", sampleImage: "scene.png" },
  featuredComponent: "camera",
  circuit: { palette: [], required: [], notes },
  codeTemplate: { language: "python", starter },
  hints,
  output,
});

const allLessons = [
  lesson(
    501,
    "vision_setup",
    "Open Your Eyes",
    "This is where your programs start to SEE. An image is not magic — it is a grid of tiny coloured squares called pixels, and a photo is just a very big grid of them. import cv2 loads OpenCV, the classic computer-vision library. cv2.imread('scene.png') reads a picture file from disk and hands you back that whole grid of pixels as one object (OpenCV calls it an image, or a Mat). cv2.imshow('camera', img) opens a window titled 'camera' and paints those exact pixels — the same ones the file stored. cv2.waitKey(0) holds the window open until a key is pressed. Run it and the camera pane fills with the real scene: blue sky, green grass, a yellow sun, a red ball. You have not changed anything yet — you have simply opened your eyes and looked. One warning for later: OpenCV stores colour as B, G, R (blue first), not R, G, B — remember that when you start picking colours apart.",
    "No breadboard here — the AI camera is pointed at a sample photo (scene.png). Type your Python on the right and press Run; cv2.imshow paints the real pixels in the camera pane.",
    "import cv2\n\n# An image is a grid of pixels. Read the photo from disk, then show it.\n",
    [
      "img = cv2.imread('scene.png')",
      "cv2.imshow('camera', img)",
      "cv2.waitKey(0)",
    ],
    { initial: "Camera: waiting", status: "Run to open your eyes..." },
  ),
  lesson(
    502,
    "vision_setup",
    "Shades of Gray",
    "Before a computer can find shapes in a picture, it usually throws the colour away and keeps only the brightness — it is easier to reason about one number per pixel than three. cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) does exactly that: it CONVERTS the colour image to grayscale. But it is not a crude average. The human eye is far more sensitive to green than to blue, so OpenCV weights the channels the way your eye does: gray = 0.299·R + 0.587·G + 0.114·B. That is why the green grass turns a fairly light gray while the pure-blue sky turns quite dark, even though both looked 'bright' in colour. Every pixel in the result is the genuine luminance of the pixel it came from — a real, checkable number. Show the gray image and compare it to the colour one: same scene, one channel of brightness instead of three of colour.",
    "The camera still looks at scene.png. Convert the colour pixels to grayscale and show the result — each gray value is that pixel's true brightness.",
    "import cv2\n\nimg = cv2.imread('scene.png')\n\n# Convert the colour image to grayscale (brightness only), then show it.\n",
    [
      "gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)",
      "cv2.imshow('gray', gray)",
      "cv2.waitKey(0)",
    ],
    { initial: "Camera: waiting", status: "Run to see in gray..." },
  ),
  lesson(
    503,
    "vision_setup",
    "The Colour Slice",
    "Now you make the computer pick out ONE colour and ignore the rest — the first real step of detecting an object. cv2.inRange(img, lower, upper) tests every pixel: if its colour falls between the lower and upper bounds it becomes white (255) in the result, and if not it becomes black (0). The white-on-black result is called a mask — it marks WHERE your colour is. Remember OpenCV's order is B, G, R, so a bound is [blue, green, red]. To catch the red ball you want pixels that are HIGH in red and LOW in blue and green: lower = [0, 0, 120] and upper = [90, 90, 255]. Run it and only the ball lights up white — the sky, grass, and yellow sun all fail the test (the sun is bright but its green is far too high), so they stay black. That mask is not decoration: it is a precise, per-pixel answer to 'is this pixel my colour?', and everything that follows — counting, locating, tracking — is built on it.",
    "The camera still looks at scene.png. Build a colour mask that keeps only the red ball: white where a pixel's B, G, R all fall in range, black everywhere else.",
    "import cv2\n\nimg = cv2.imread('scene.png')\n\n# OpenCV order is [B, G, R]. Keep pixels that are high in red, low in blue/green.\n# Build the mask with cv2.inRange, then show it.\n",
    [
      "lower = [0, 0, 120]",
      "upper = [90, 90, 255]",
      "mask = cv2.inRange(img, lower, upper)",
      "cv2.imshow('mask', mask)",
      "cv2.waitKey(0)",
    ],
    { initial: "Camera: waiting", status: "Run to slice out the colour..." },
  ),
];

const toAdd = allLessons.filter((l) => l.id <= LIMIT);
for (const l of toAdd) {
  const existing = lessons.lessons.findIndex((x) => x.id === l.id);
  if (existing >= 0) {
    lessons.lessons[existing] = l;
  } else {
    let insertAt = lessons.lessons.findIndex((x) => x.id > l.id);
    if (insertAt < 0) insertAt = lessons.lessons.length;
    lessons.lessons.splice(insertAt, 0, l);
  }
}

// ---- components: add the `camera` part (the featured component for vision), the
// same additive upsert used for pi/pc. Idempotent by id.
const componentsPath = path.join(FE, "components.json");
const components = JSON.parse(fs.readFileSync(componentsPath, "utf8"));
const camera = {
  id: "camera",
  name: "Camera Module — Digital Eye",
  category: "input",
  function:
    "Turns light into pixels. A lens focuses the scene onto a grid of tiny light sensors, and the module reports each sensor's brightness and colour as a number — millions of them per frame. That grid of numbers IS the image your Python reads: computer vision is just arithmetic on those pixels.",
  science:
    "The sensor is a CMOS array of photodiodes, one per pixel. Each converts incoming photons into a charge, which is measured and digitised to a value (0–255 per channel with 8-bit depth). A colour filter over the array (a Bayer pattern of red, green, and blue) lets each site record one colour; the module interpolates the rest, producing three channels — OpenCV stores them as B, G, R. More light means a higher number; that is why grayscale (brightness) is just a weighted blend of the three.",
  specs: {
    output: "Frames of pixels (width × height × 3 colour channels)",
    depth: "8-bit per channel (0–255)",
    colourOrder: "OpenCV reads B, G, R",
    connection: "Ribbon cable to the Pi's camera (CSI) port or USB",
  },
  notes:
    "In these lessons the camera looks at a sample photo so results are exact and repeatable. cv2.imread() gives you the same pixel grid a real frame would; everything you learn here works unchanged on a live camera feed.",
  terminals: "Ribbon/USB to the host — no breadboard wiring.",
};
const ci = components.components.findIndex((c) => c.id === "camera");
if (ci >= 0) components.components[ci] = camera;
else components.components.push(camera);

const writeBoth = (name, obj) => {
  const text = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(path.join(FE, name), text);
  fs.writeFileSync(path.join(BE, name), text);
  console.log("wrote", name, "-> frontend + backend");
};
writeBoth("lessons.json", lessons);
writeBoth("components.json", components);
console.log(
  "ai vision lessons through",
  LIMIT + ":",
  toAdd.map((l) => l.id).join(", "),
  "| total lessons:",
  lessons.lessons.length,
);
