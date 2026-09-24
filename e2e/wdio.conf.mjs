import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

let tauriDriver;
let shuttingDown = false;

export const config = {
  host: "127.0.0.1",
  port: 4444,
  specs: ["./specs/**/*.e2e.mjs"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: path.resolve(
          process.cwd(),
          "../src-tauri/target/debug/taurin4.exe",
        ),
      },
    },
  ],
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 120000,
  },
  waitforTimeout: 20000,
  connectionRetryTimeout: 120000,
  beforeSession: () => {
    const driverPath = path.join(
      os.homedir(),
      ".cargo",
      "bin",
      process.platform === "win32" ? "tauri-driver.exe" : "tauri-driver",
    );

    tauriDriver = spawn(driverPath, [], {
      stdio: [null, process.stdout, process.stderr],
    });

    tauriDriver.on("error", (error) => {
      console.error("tauri-driver error:", error);
      process.exitCode = 1;
    });

    tauriDriver.on("exit", (code) => {
      if (!shuttingDown && code !== 0) {
        console.error("tauri-driver exited with code:", code);
        process.exitCode = 1;
      }
    });
  },
  afterSession: () => {
    shuttingDown = true;
    tauriDriver?.kill();
  },
};
