// One-shot, idempotent: add the AI track's first vision lessons (501-503) to the
// frontend data files, then mirror both to the backend copy. These are the VISION
// lessons (kind:"vision"): the learner writes PYTHON with OpenCV (cv2) that reads
// REAL pixels. cv2.imread() hands back the committed sample photo or a procedural
// ball scene; every cv2 operation genuinely computes over those bytes in src/sim/cv.ts.
// Nothing is read from engine/LED state — the vision only ever sees pixels.
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
// a pixel's B, G and R all fall in [lower, upper]. Connected regions, pixel area
// and spatial moments are calculated from those mask bytes. A missing image is
// honest None; an unsupported cv2.<x> raises a real error.
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
// via cv2. There is no circuit — the camera uses a committed photo or generated
// scene, so palette/required are empty and the featured part is the camera.
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

const ballLesson = (id, title, description, notes, starter, hints, output) => ({
  ...lesson(id, "opencv", title, description, notes, starter, hints, output),
  vision: { scene: "ball" },
});

const ledLesson = (id, title, description, notes, starter, hints, output) => ({
  ...lesson(id, "opencv", title, description, notes, starter, hints, output),
  vision: { scene: "led" },
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
  lesson(
    504,
    "vision_setup",
    "Every Pixel Is a Number",
    "An image is a grid, and every pixel has a coordinate. img.shape tells you the size in (rows, columns, colour channels) order — height first, then width. To read one colour pixel, use img[row, column]. OpenCV returns its channels in B, G, R order, so the red ball at row 104 and column 150 reads [40, 40, 220], not [220, 40, 40]. Coordinates start at zero, just like list indices. You can now inspect the image instead of treating it as a picture-shaped mystery.",
    "Print the image shape and inspect the red ball's pixel at row 104, column 150.",
    "import cv2\n\nimg = cv2.imread('scene.png')\n\n# Image shape is (rows, columns, channels); pixel order is [B, G, R].\n",
    [
      "print(img.shape)",
      "pixel = img[104, 150]",
      "print(pixel)",
      "cv2.waitKey(0)",
    ],
    { initial: "Camera: waiting", status: "Run to inspect the pixels..." },
  ),
  lesson(
    505,
    "vision_setup",
    "Light and Dark",
    "A threshold turns a grayscale image into a clean black-and-white decision. cv2.threshold(gray, cutoff, max_value, cv2.THRESH_BINARY) checks every brightness value: values greater than the cutoff become max_value, and the rest become zero. It returns two things — the cutoff used, then the new image — which is why Python can unpack it into ret and bright. The image is computed from the real grayscale pixels, not a preset effect.",
    "Convert the image to grayscale, keep only pixels brighter than 100, and show the binary result.",
    "import cv2\n\nimg = cv2.imread('scene.png')\ngray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)\n\n# Threshold returns the cutoff used and a newly computed binary image.\n",
    [
      "ret, bright = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY)",
      "cv2.imshow('bright', bright)",
      "cv2.waitKey(0)",
    ],
    { initial: "Camera: waiting", status: "Run to separate light from dark..." },
  ),
  lesson(
    506,
    "vision_setup",
    "Count the Bright Pixels",
    "A binary mask is not just a picture — it is a set of measurable answers. First turn the scene gray, then threshold at 180 so only very bright pixels become white. cv2.countNonZero(mask) counts the pixels whose value is not zero. In this scene the sun is bright enough to pass; the blue sky, grass, and red ball are not. The count comes from the mask's real pixel buffer, so changing the threshold changes what gets counted.",
    "Threshold the grayscale photo at 180, count the white pixels, and display the mask.",
    "import cv2\n\nimg = cv2.imread('scene.png')\ngray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)\n\n# Keep very bright pixels, then count the nonzero pixels in the mask.\n",
    [
      "ret, mask = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)",
      "bright_pixels = cv2.countNonZero(mask)",
      "print(bright_pixels)",
      "cv2.imshow('bright pixels', mask)",
      "cv2.waitKey(0)",
    ],
    { initial: "Camera: waiting", status: "Run to count the bright pixels..." },
  ),
  lesson(
    507,
    "vision_setup",
    "Draw a Box Around It",
    "Once a mask marks an object, cv2.boundingRect(mask) measures the smallest rectangle that contains every nonzero pixel. It returns x, y, width, and height — the left edge, top edge, and size of the detected region. cv2.rectangle(image, point1, point2, colour, thickness) then draws onto the image itself. The points are inclusive, so use x + width - 1 and y + height - 1 for the far corner. The green outline you see is drawn around the red pixels actually found in the mask.",
    "Make a mask for the red ball, find its bounds, then draw the measured box on the original image.",
    "import cv2\n\nimg = cv2.imread('scene.png')\n\n# Find the red pixels, measure their bounds, then draw on img.\n",
    [
      "mask = cv2.inRange(img, [0, 0, 120], [90, 90, 255])",
      "x, y, w, h = cv2.boundingRect(mask)",
      "cv2.rectangle(img, (x, y), (x + w - 1, y + h - 1), (0, 255, 0), 2)",
      "cv2.imshow('detected object', img)",
      "cv2.waitKey(0)",
    ],
    { initial: "Camera: waiting", status: "Run to draw a box around the ball..." },
  ),
  lesson(
    508,
    "vision_setup",
    "Your First Vision Pipeline",
    "Put the whole setup together: inspect one pixel, isolate the red ball, count the pixels in its mask, measure the object's bounds, and draw a box on the original scene. Each result comes from the last one's real pixels — the colour bounds create the mask, the mask determines the count and rectangle, and the rectangle is drawn in place. This is the basic shape of a computer-vision pipeline: read, measure, decide, and show. From here, OpenCV lessons will make the image processing more powerful.",
    "Build a complete red-object pipeline: inspect a known pixel, mask the red ball, count the mask, measure its bounds, and draw the box.",
    "import cv2\n\nimg = cv2.imread('scene.png')\n\n# Inspect one pixel, detect the red object, and draw its measured bounds.\n",
    [
      "pixel = img[104, 150]",
      "print(pixel)",
      "mask = cv2.inRange(img, [0, 0, 120], [90, 90, 255])",
      "print(cv2.countNonZero(mask))",
      "x, y, w, h = cv2.boundingRect(mask)",
      "cv2.rectangle(img, (x, y), (x + w - 1, y + h - 1), (0, 255, 0), 2)",
      "cv2.imshow('vision pipeline', img)",
      "cv2.waitKey(0)",
    ],
    { initial: "Camera: waiting", status: "Run your first complete vision pipeline..." },
  ),
  ballLesson(
    509,
    "Contours",
    "A colour mask may contain several separate objects. cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE) finds each separate connected region of white pixels and returns the contours plus a hierarchy that links neighbouring regions. Here the red mask contains a small red marker and a larger red ball; the blue object and dark background do not pass the red range. Count the returned contours, then look at the mask that produced them.",
    "Make a red mask, find its external contours, print how many separate red regions were found, and show the mask.",
    "import cv2\n\nimg = cv2.imread('ball')\n\n# Find separate connected red regions in the binary mask.\n",
    [
      "mask = cv2.inRange(img, [0, 0, 120], [90, 90, 255])",
      "contours, hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)",
      "print(len(contours))",
      "print(hierarchy[0][0])",
      "cv2.imshow('red contours', mask)",
      "cv2.waitKey(0)",
    ],
    { initial: "Camera: waiting", status: "Run to find the red regions..." },
  ),
  ballLesson(
    510,
    "The Biggest Blob",
    "A scene can contain more than one object of the same colour. cv2.contourArea(contour) measures the pixel area of each connected region, so compare every contour and keep the one with the largest area. The movable red ball is larger than the small red marker. In this simulator, area is the exact number of foreground pixels in the component, making the winner easy to verify.",
    "Find all red contours, keep the largest by area, and print its pixel area.",
    "import cv2\n\nimg = cv2.imread('ball')\nmask = cv2.inRange(img, [0, 0, 120], [90, 90, 255])\ncontours, hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)\n\n# Compare each connected region's pixel area to find the largest.\n",
    [
      "largest = contours[0]",
      "largest_area = cv2.contourArea(largest)",
      "for contour in contours:",
      "    area = cv2.contourArea(contour)",
      "    if area > largest_area:",
      "        largest = contour",
      "        largest_area = area",
      "print(largest_area)",
    ],
    { initial: "Camera: waiting", status: "Run to measure the largest red object..." },
  ),
  ballLesson(
    511,
    "The Centroid",
    "The centroid is the balance point of a shape. cv2.moments(contour) calculates spatial moments from the component's mask pixels. Divide m10 by m00 to get the horizontal centre and m01 by m00 to get the vertical centre. Draw that measured point with cv2.circle. Move the red ball slider and run again: the green dot follows the largest red region because its position is computed from image pixels.",
    "Find the largest red contour, calculate its centre from moments, draw a green dot, and show it.",
    "import cv2\n\nimg = cv2.imread('ball')\nmask = cv2.inRange(img, [0, 0, 120], [90, 90, 255])\ncontours, hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)\n\n# Use the largest contour's spatial moments to find its centre.\n",
    [
      "largest = contours[0]",
      "for contour in contours:",
      "    if cv2.contourArea(contour) > cv2.contourArea(largest):",
      "        largest = contour",
      "moments = cv2.moments(largest)",
      "cx = int(moments['m10'] / moments['m00'])",
      "cy = int(moments['m01'] / moments['m00'])",
      "print(cx, cy)",
      "cv2.circle(img, (cx, cy), 5, (0, 255, 0), -1)",
      "cv2.imshow('centroid', img)",
      "cv2.waitKey(0)",
    ],
    { initial: "Camera: waiting", status: "Run to calculate and draw the centroid..." },
  ),
  ballLesson(
    512,
    "Track It",
    "Tracking repeats the same pixel measurements over time. Each loop reads a fresh ball-scene frame, finds the largest red contour, computes its centroid, and draws the centre. The slider changes the position used to generate each new frame, so move the subject while the program runs and watch the measured dot follow it. Press Stop when you are done. The tracker never reads the slider value directly — it only sees the pixels returned by imread.",
    "Continuously read fresh frames, detect the largest red region, and draw its pixel-derived centroid as you move the ball.",
    "import cv2\nimport time\n\n# Read a fresh scene in each pass; press Stop to end the loop.\n",
    [
      "while True:",
      "    img = cv2.imread('ball')",
      "    mask = cv2.inRange(img, [0, 0, 120], [90, 90, 255])",
      "    contours, hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)",
      "    largest = contours[0]",
      "    for contour in contours:",
      "        if cv2.contourArea(contour) > cv2.contourArea(largest):",
      "            largest = contour",
      "    moments = cv2.moments(largest)",
      "    cx = int(moments['m10'] / moments['m00'])",
      "    cy = int(moments['m01'] / moments['m00'])",
      "    cv2.circle(img, (cx, cy), 5, (0, 255, 0), -1)",
      "    cv2.imshow('tracking', img)",
      "    time.sleep(0.08)",
    ],
    { initial: "Camera: waiting", status: "Run, then move the slider to track the ball..." },
  ),
  ballLesson(
    513,
    "Left or Right",
    "A measured centre lets a program make a decision about where an object is. Compare the horizontal centroid, cx, with half the image width, img.shape[1] // 2. If cx is smaller, the object is on the left; otherwise it is on the right. The decision comes from the centroid computed from image pixels. Move the ball slider across the centre line and rerun to test both branches.",
    "Calculate the largest red object's centroid and report whether it is left or right of the image centre.",
    "import cv2\n\nimg = cv2.imread('ball')\nmask = cv2.inRange(img, [0, 0, 120], [90, 90, 255])\ncontours, hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)\n\n# Decide which side the measured centroid is on.\n",
    [
      "largest = contours[0]",
      "for contour in contours:",
      "    if cv2.contourArea(contour) > cv2.contourArea(largest):",
      "        largest = contour",
      "moments = cv2.moments(largest)",
      "cx = int(moments['m10'] / moments['m00'])",
      "if cx < img.shape[1] // 2:",
      "    print('LEFT')",
      "else:",
      "    print('RIGHT')",
    ],
    { initial: "Camera: waiting", status: "Move the ball and classify its side..." },
  ),
  ballLesson(
    514,
    "Two Colors",
    "A vision program can ask two questions of the same frame. Build one mask for red and another for blue with cv2.inRange, then count each mask's nonzero pixels. The red count includes the large moving ball and its small marker; the blue count comes from the separate blue object. Comparing the computed counts tells you which colour covers more of the image. Both results are read from real pixel masks.",
    "Create separate red and blue masks, count their pixels, and report which colour covers more of the scene.",
    "import cv2\n\nimg = cv2.imread('ball')\n\n# Compare two independently computed colour masks.\n",
    [
      "red_mask = cv2.inRange(img, [0, 0, 120], [90, 90, 255])",
      "blue_mask = cv2.inRange(img, [120, 40, 0], [255, 140, 100])",
      "red_count = cv2.countNonZero(red_mask)",
      "blue_count = cv2.countNonZero(blue_mask)",
      "print('red', red_count)",
      "print('blue', blue_count)",
      "if red_count > blue_count:",
      "    print('More red pixels')",
      "else:",
      "    print('More blue pixels')",
      "cv2.imshow('red mask', red_mask)",
      "cv2.waitKey(0)",
    ],
    { initial: "Camera: waiting", status: "Run to compare the two colour masks..." },
  ),
  ledLesson(
    515,
    "Meet the Blinking LED",
    "The sandbox camera sees a red LED that stays bright for 0.4 seconds, then dark for 0.4 seconds. Capture a fresh frame with cv2.grabFrame() and display it. This camera hook is specific to the lesson sandbox; the image it returns is an ordinary pixel frame that the same OpenCV operations can inspect.",
    "The camera scene is generated from pixels on a steady clock: the LED alternates between bright red and dim red every 0.4 seconds. cv2.grabFrame() is the sandbox's live-camera source and returns a new frame each time; it does not report whether the LED is on. Every later decision must be computed from those pixel values.",
    "import cv2\n\n# Capture and display one fresh frame from the camera.\n",
    [
      "frame = cv2.grabFrame()",
      "cv2.imshow('LED camera', frame)",
      "cv2.waitKey(0)",
    ],
    { initial: "Camera: waiting", status: "Capture a fresh pixel frame from the blinking LED..." },
  ),
  ledLesson(
    516,
    "Is the LED On?",
    "A camera does not know what an LED is; it only measures pixel brightness. Convert a fresh frame to grayscale, threshold the image, and count the bright pixels. A nonzero count means the red LED is bright in the pixels you captured; a zero count means it is dark.",
    "The LED centre is at x=120, y=80. Its on pixels have grayscale luminance above 80; the off LED and background are below that threshold. cv2.threshold returns the cutoff and a new binary mask, and countNonZero counts that mask's actual white pixels. Python uses 4 spaces per indent level: press Enter after the colon in `if lit > 0:` and the editor will indent the next line. Put `print('LED is ON')` four spaces inside the if block. Align `else:` with `if lit > 0:`, then indent `print('LED is OFF')` four spaces inside the else block. Tab inserts four spaces.",
    "import cv2\n\nframe = cv2.grabFrame()\ngray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)\n# Turn brightness into a black-and-white mask.\n",
    [
      "ret, bright = cv2.threshold(gray, 80, 255, cv2.THRESH_BINARY)",
      "lit = cv2.countNonZero(bright)",
      "if lit > 0:",
      "    print('LED is ON')",
      "else:",
      "    print('LED is OFF')",
      "cv2.imshow('brightness mask', bright)",
    ],
    { initial: "Camera: waiting", status: "Threshold the frame to decide from its pixels..." },
  ),
  ledLesson(
    517,
    "Count the Blinks",
    "One frame can say whether the light is on; a sequence of frames reveals when it blinks. Sample the camera repeatedly, threshold each image, and count only transitions from dark to bright. The total comes from changes in measured pixels, not a hidden LED flag.",
    "The camera scene alternates every 0.4 seconds. Twenty samples, 0.1 seconds apart, span about two seconds. `previous` stores the last pixel-derived state (0=dark, 1=bright); increment the count only when the new state is 1 and the previous state was 0.",
    "import cv2\nimport time\n\nprevious = -1\nblinks = 0\n# Sample the camera over time and count dark-to-bright changes.\n",
    [
      "for sample in range(20):",
      "    frame = cv2.grabFrame()",
      "    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)",
      "    ret, bright = cv2.threshold(gray, 80, 255, cv2.THRESH_BINARY)",
      "    lit = cv2.countNonZero(bright)",
      "    state = 0",
      "    if lit > 0:",
      "        state = 1",
      "    if previous == 0 and state == 1:",
      "        blinks = blinks + 1",
      "        print('BLINK')",
      "    previous = state",
      "    cv2.imshow('LED camera', frame)",
      "    time.sleep(0.1)",
      "print('Blinks:', blinks)",
    ],
    { initial: "Camera: waiting", status: "Count OFF-to-ON changes across fresh frames..." },
  ),
  ledLesson(
    518,
    "Capstone — Watch and React",
    "Build the complete vision loop: capture each new frame, threshold its brightness, compare the measured state with the previous one, and react when the LED changes. The bounded two-second run reports ON and OFF events as they happen, then stops on its own.",
    "This capstone uses only cv2.grabFrame pixel buffers, grayscale conversion, thresholding and a previous-state comparison. It does not read an LED variable or circuit output. The loop is bounded to 20 frames so the program finishes without a manual Stop.",
    "import cv2\nimport time\n\nprevious = -1\n# Watch each camera frame and report changes in measured brightness.\n",
    [
      "for sample in range(20):",
      "    frame = cv2.grabFrame()",
      "    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)",
      "    ret, bright = cv2.threshold(gray, 80, 255, cv2.THRESH_BINARY)",
      "    lit = cv2.countNonZero(bright)",
      "    state = 0",
      "    if lit > 0:",
      "        state = 1",
      "    if state != previous:",
      "        if state == 1:",
      "            print('LED turned ON')",
      "        else:",
      "            print('LED turned OFF')",
      "    previous = state",
      "    cv2.imshow('LED response', frame)",
      "    time.sleep(0.1)",
      "print('Monitoring complete')",
    ],
    { initial: "Camera: waiting", status: "Run the complete pixel-based response loop..." },
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
    "Vision lessons use a committed sample photo or a generated scene, so results are repeatable. cv2.imread() and the sandbox frame-capture hook both deliver pixel buffers; every CV operation works on those pixels.",
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
