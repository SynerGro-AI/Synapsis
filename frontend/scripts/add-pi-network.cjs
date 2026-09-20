// One-shot, idempotent: add the Pi track's "Networking & Users" lessons (313-320)
// to the frontend data files, then mirror both to the backend copy. These are
// TERMINAL lessons (kind:"terminal") running on the real in-memory shell
// (src/sim/shell.ts) — no components.json change.
//
// Staged shipping (matches the live-safe deploy cadence):
//   node scripts/add-pi-network.cjs 316   -> partial (313-316)
//   node scripts/add-pi-network.cjs        -> all (313-320)
// Re-running upserts, so it is always safe to run again.
//
// Authenticity is the hard rule: every command genuinely does the real thing in
// the sandbox — ifconfig/ip/hostname all read one consistent interface model
// (eth0 192.168.1.42, MAC b8:27:eb… the real Raspberry Pi OUI); ping reaches
// only hosts that actually exist on the sandbox LAN and honestly reports
// "Name or service not known" for anything off it (there is no faked internet);
// ssh logs into a genuine second Pi (pi-node) with its own filesystem and the
// prompt/host really change until you exit; adduser needs root and really writes
// /etc/passwd; su really switches the current user; dd really creates the backup
// image file with the copied byte count. One new concept per lesson, reusing the
// previous ones (the compounding rule). Prompt is pi@raspberrypi, home /home/pi.
const fs = require("fs");
const path = require("path");

const LIMIT = process.argv[2] ? Number(process.argv[2]) : 320;

const FE = path.join(__dirname, "..", "public", "data");
const BE = path.join(__dirname, "..", "..", "backend", "Synapsys.Api", "Data");

const lessonsPath = path.join(FE, "lessons.json");
const lessons = JSON.parse(fs.readFileSync(lessonsPath, "utf8"));

// ---- lessons.json: activate the Networking & Users phase ----
const phase = lessons.phases.find((p) => p.id === "pi_network");
if (phase) delete phase.status; // drop "coming-soon" -> the phase goes live

const CREDIT =
  "Paul McWhorter, Raspberry Pi Linux lessons — toptechboy.com; support at patreon.com/PaulMcWhorter";

// ---- a light /home/pi seeded into every lesson's sandbox ----
// These networking lessons lean on the system models (interfaces, users, disks)
// far more than on home files, but a couple of files make `ls` look like a real
// Pi and give the SD-backup capstone a place to write its image.
const f = (content) => ({ type: "file", content });
const d = (children) => ({ type: "dir", children });

const seed = {
  "README.txt": f(
    "Raspberry Pi on the network.\nTry ifconfig to see this Pi's IP address, then ping to reach another machine.",
  ),
  projects: d({
    "blink.py": f("# blink an LED on the Pi\nimport time"),
  }),
};

// Every networking lesson shares the same terminal shape: pi@raspberrypi in
// /home/pi, with the light seeded home above.
const term = (intro, steps) => ({
  shell: "bash",
  user: "pi",
  host: "raspberrypi",
  cwd: "~",
  intro,
  seed,
  steps,
});

// Terminal lessons still carry the (empty) Arduino-shaped fields the loader expects.
const lesson = (id, title, description, intro, steps) => ({
  id,
  phase: "pi_network",
  title,
  description,
  source: CREDIT,
  kind: "terminal",
  terminal: term(intro, steps),
  featuredComponent: "terminal",
  circuit: { palette: [], required: [], notes: "" },
  codeTemplate: { language: "bash", starter: "" },
  hints: [],
  output: { initial: "", status: "" },
});

const allLessons = [
  lesson(
    313,
    "Your Pi on the Network",
    "The moment a Raspberry Pi joins a network it gets an identity: an IP address (like 192.168.1.42) so other machines can find it, a MAC address burned into its network chip, and a hostname. ifconfig lists every network interface — eth0 is the wired port, wlan0 is Wi-Fi, and lo is the loopback the Pi uses to talk to itself. The newer ip addr shows the same thing. When you just want the Pi's IP to type into another computer, hostname -I prints exactly that.",
    "You are on a Raspberry Pi wired into a home network. Every command below reads the same real interface configuration, so the IP you see in one is the IP you see in all of them. Type each command in turn.",
    [
      { cmd: "ifconfig", why: "List all network interfaces. eth0 shows inet 192.168.1.42 — this Pi's address on the LAN — plus its ether (MAC) address." },
      { cmd: "ifconfig eth0", why: "Look at just the wired interface. Naming one interface filters the output to it." },
      { cmd: "ip addr", why: "The modern replacement for ifconfig. Same facts, different layout: inet 192.168.1.42/24 on eth0." },
      { cmd: "hostname", why: "Print this Pi's name on the network: raspberrypi." },
      { cmd: "hostname -I", why: "Print just the IP address(es) — handy when you need the number to connect from another machine." },
    ],
  ),
  lesson(
    314,
    "Testing Connections with ping",
    "Before one machine can talk to another, you want to know it is reachable. ping sends a tiny packet and times how long the reply takes — the classic 'are you there?' test. ping -c 3 sends three packets then stops (without -c it runs forever, and you press Ctrl+C to end it). A reply with a low time in milliseconds means a healthy connection; no reply means the host is down, unplugged, or does not exist. This sandbox is a local network with no route to the wider internet, so you ping machines that are actually on it.",
    "Use ping to prove three things are reachable: the Pi itself, the router, and a second Pi on the same network. Watch the round-trip time on each reply.",
    [
      { cmd: "ping -c 3 localhost", why: "A Pi can always reach itself over the loopback (127.0.0.1). -c 3 sends exactly three packets." },
      { cmd: "ping -c 3 192.168.1.1", why: "192.168.1.1 is the router/gateway. Reaching it confirms the Pi is really on the LAN." },
      { cmd: "ping -c 3 pi-node", why: "pi-node is a second Raspberry Pi on this network. You can ping a machine by name, not just by number." },
    ],
  ),
  lesson(
    315,
    "Remote Control with SSH",
    "SSH (Secure Shell) lets you open a command line on another computer over the network — no monitor or keyboard needed on that machine, which is exactly how most Raspberry Pis are run. You type ssh user@host: ssh pi@pi-node logs in as user pi on the machine called pi-node. Once connected, your prompt changes to show the remote host, and every command you type now runs over there instead of here. The first time you ever connect to a new machine, real SSH asks you to confirm its fingerprint — a one-time trust check.",
    "Reach out to the second Pi and take control of it. Notice the prompt: after ssh it reads pi@pi-node, telling you the commands now run on the remote machine.",
    [
      { cmd: "ping -c 2 pi-node", why: "First confirm the remote Pi is reachable — no point trying to log in to a machine that is down." },
      { cmd: "ssh pi@pi-node", why: "Log in as user pi on host pi-node. The prompt switches to pi@pi-node: you are now on the other Pi." },
      { cmd: "hostname", why: "Proof you moved: this prints pi-node, not raspberrypi. You are running commands on the remote machine." },
      { cmd: "pwd", why: "You land in the remote Pi's own home directory, /home/pi — its files, not the ones you left behind." },
    ],
  ),
  lesson(
    316,
    "Work Remotely, Then Log Out",
    "Once you are connected over SSH, the remote Pi is yours: you run the same Linux commands you already know — ls, cat, grep — but they act on that machine's files. This is how you check a sensor log on a Pi in the garden from your desk. When you are finished, exit (or logout) closes the SSH session and drops you back onto your own machine. It is worth being deliberate about it: after exit, the prompt tells you which machine you are on again.",
    "Log in to the second Pi, read data that only exists over there, then cleanly log out and confirm you are home. The remote Pi has a greenhouse sensor log its owner left behind.",
    [
      { cmd: "ssh pi@pi-node", why: "Open a shell on the remote Pi again (the tool you learned last lesson)." },
      { cmd: "ls", why: "List the remote home directory — different files from your own Pi, because this is a different machine." },
      { cmd: "cat greenhouse/readings.csv", why: "Read a sensor file that lives only on pi-node. cat works the same over SSH as it does locally." },
      { cmd: "exit", why: "Close the SSH session. It prints 'logout' and 'Connection to pi-node closed.' and returns you to your own Pi." },
      { cmd: "hostname", why: "Back to raspberrypi — the exit really brought you home." },
    ],
  ),
  lesson(
    317,
    "Who Are You? Users on the System",
    "Linux is multi-user: every process runs as some account, and every file is owned by one. You already met whoami, which prints your username — pi. id goes further, showing your numeric user id (uid), your main group id (gid), and every group you belong to. Groups are how Linux hands out privileges: being in the sudo group is what lets pi use sudo, and groups like gpio and i2c are what let it touch the Pi's hardware pins. Every account on the machine is recorded, one line each, in the file /etc/passwd.",
    "Inspect your own account and the system's list of users. These commands only read information — they change nothing.",
    [
      { cmd: "whoami", why: "The simplest question: which user am I? On a fresh Pi, pi." },
      { cmd: "id", why: "The full identity: uid=1000(pi), gid=1000(pi), and the groups — including sudo, gpio and i2c that grant privileges." },
      { cmd: "groups", why: "Just the group names you belong to. Membership in these decides what you are allowed to do." },
      { cmd: "cat /etc/passwd", why: "Every account on the system, one per line: name, uid, gid, home directory and login shell." },
    ],
  ),
  lesson(
    318,
    "Adding and Switching Users",
    "Adding a person to a Pi means creating an account for them — but ordinary users are not allowed to do that, so you prefix the command with sudo to run it as the administrator: sudo adduser bob. That makes a new user, a matching group, and a home directory. Once bob exists you can become bob with su ('switch user'): sudo su - bob starts a fresh shell as bob, with bob's identity and home. When you are done acting as them, exit returns you to your own account. This is the everyday way to set up and test other people's logins.",
    "Create a second user, confirm the system recorded them, switch into their account, and switch back. Watch the prompt change from pi to bob and back.",
    [
      { cmd: "sudo adduser bob", why: "Create a new account 'bob'. Adding a user is an admin action, so it needs sudo — a plain user is refused." },
      { cmd: "cat /etc/passwd | grep bob", why: "Verify it worked: grep pulls bob's new line out of the accounts file. He has his own uid and /home/bob." },
      { cmd: "sudo su - bob", why: "Switch into bob's account. The '-' gives a full login shell, so you start in bob's home as bob." },
      { cmd: "whoami", why: "Confirm the switch — this now prints bob, not pi. You are acting as a different user." },
      { cmd: "exit", why: "Leave bob's shell and return to your own pi account." },
    ],
  ),
  lesson(
    319,
    "Disks and Storage",
    "A Raspberry Pi boots from a microSD card, and it helps to see how that storage is laid out. lsblk ('list block devices') draws the card as a tree: the whole card is mmcblk0, split into partitions — a small boot partition mounted at /boot/firmware and the big one mounted at / that holds Linux and all your files. df ('disk free') answers the other question: how much room is left? On its own it reports in 1K blocks; add -h for human-readable gigabytes and megabytes, so you can tell at a glance whether the card is filling up.",
    "Look at the SD card's partitions, then check how much space is used and free. These are the two commands you reach for when a Pi is running low on room.",
    [
      { cmd: "lsblk", why: "List the block devices. The SD card mmcblk0 splits into mmcblk0p1 (/boot/firmware) and mmcblk0p2 (/)." },
      { cmd: "df", why: "Disk usage per filesystem, in 1K blocks — used, available, and percent full." },
      { cmd: "df -h", why: "The same numbers in human-readable form: G for gigabytes, M for megabytes. Far easier to read." },
    ],
  ),
  lesson(
    320,
    "Capstone: Back Up Your SD Card",
    "SD cards fail, so the single most valuable Pi skill is making a backup image of the card that you can flash onto a new one. The tool is dd, which copies raw bytes from one place to another: if= is the input (the SD card, /dev/mmcblk0) and of= is the output file. bs sets the block size and count how many blocks to copy. Reading the raw device needs administrator rights, so it runs under sudo. A real backup images the entire card and is many gigabytes — usually done from another computer with the card in a reader — so here you copy a safe 100 MB slice to learn the exact command, then confirm the image really appeared.",
    "The capstone ties it together: inspect the device, check there is room, image a slice of the card, and verify the backup file. Every command is one you have met.",
    [
      { cmd: "lsblk", why: "Confirm the device name before you copy it: the SD card is mmcblk0. Copying the wrong device is how backups go wrong." },
      { cmd: "df -h", why: "Check there is free space to hold the image file before you start." },
      { cmd: "sudo dd if=/dev/mmcblk0 of=backup.img bs=1M count=100", why: "Copy 100 blocks of 1M from the card into backup.img. if=input, of=output; reading /dev needs sudo. dd prints records in/out and the byte count." },
      { cmd: "ls -lh backup.img", why: "Verify the backup: the image file is really there, about 100M in size — proof dd wrote it." },
    ],
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

const writeBoth = (name, obj) => {
  const text = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(path.join(FE, name), text);
  fs.writeFileSync(path.join(BE, name), text);
  console.log("wrote", name, "-> frontend + backend");
};
writeBoth("lessons.json", lessons);
console.log(
  "pi network lessons through",
  LIMIT + ":",
  toAdd.map((l) => l.id).join(", "),
  "| total lessons:",
  lessons.lessons.length,
);
