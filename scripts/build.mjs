import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const buildRoot = join(projectRoot, "build");

const runtimeFiles = [
  "background.js",
  "constants.js",
  "content.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "utils/ics.js",
  "utils/termDates.js",
  "utils/authGoogle.js",
  "utils/authMicrosoft.js",
  "utils/googleCalendar.js",
  "utils/outlookCalendar.js",
  "utils/events.js",
  "utils/extApi.js",
  "assets/icon32.png",
  "assets/icon48.png",
  "assets/icon96.png",
  "assets/icon128.png"
];

async function copyRuntimeFiles(targetDirectory) {
  for (const relativePath of runtimeFiles) {
    const targetPath = join(targetDirectory, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(join(projectRoot, relativePath), targetPath);
  }
}

async function stageTarget(target, manifestFile) {
  const targetDirectory = join(buildRoot, target);
  await mkdir(targetDirectory, { recursive: true });
  await copyRuntimeFiles(targetDirectory);

  const manifest = await readFile(join(projectRoot, manifestFile), "utf8");
  await writeFile(join(targetDirectory, "manifest.json"), manifest);
}

await rm(buildRoot, { recursive: true, force: true });
await Promise.all([
  stageTarget("chrome", "manifest.json"),
  stageTarget("firefox", "manifest.firefox.json")
]);

console.log("Staged clean Chrome and Firefox release directories.");
