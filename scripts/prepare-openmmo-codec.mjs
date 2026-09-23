import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PINNED_OPENMMO_COMMIT =
  "950e081c178d920c10c51f2d31f60c1b3383c925";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, "..");
const sourceDir = process.env.OPENMMO_SOURCE_DIR
  ? path.resolve(process.env.OPENMMO_SOURCE_DIR)
  : null;

if (!sourceDir) {
  throw new Error(
    "OPENMMO_SOURCE_DIR is required. Point it to a separate pinned OpenMMO checkout.",
  );
}

const sharedDir = path.join(sourceDir, "shared");
const cargoToml = path.join(sharedDir, "Cargo.toml");
if (!existsSync(cargoToml)) {
  throw new Error("OpenMMO shared/Cargo.toml was not found: " + cargoToml);
}

let actualCommit = "unknown";
try {
  actualCommit = execFileSync(
    "git",
    ["-C", sourceDir, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
} catch {
  throw new Error("OPENMMO_SOURCE_DIR must be a Git checkout");
}

if (actualCommit !== PINNED_OPENMMO_COMMIT) {
  throw new Error(
    "OpenMMO checkout is not pinned to the audited commit. expected=" +
      PINNED_OPENMMO_COMMIT +
      " actual=" +
      actualCommit,
  );
}

const outDir = path.join(repoDir, "public", "openmmo-wasm");
mkdirSync(outDir, { recursive: true });

execFileSync(
  "wasm-pack",
  [
    "build",
    sharedDir,
    "--target",
    "web",
    "--release",
    "--out-dir",
    outDir,
    "--out-name",
    "onlinerpg_shared",
  ],
  { stdio: "inherit" },
);

const packagePath = path.join(outDir, "package.json");
if (existsSync(packagePath)) {
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  pkg.private = true;
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
}

writeFileSync(
  path.join(outDir, "PINNED_OPENMMO.txt"),
  [
    "OpenMMO browser codec generated for idea2 M2.",
    "source_commit=" + PINNED_OPENMMO_COMMIT,
    "generated_from=" + sourceDir,
    "",
    "Do not treat generated codec files as the canonical OpenMMO source.",
    "",
  ].join("\n"),
);

console.log("Prepared pinned OpenMMO browser codec:", outDir);
