import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const androidDir = path.join(projectRoot, "android");
const softMode = process.argv.includes("--soft");

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function isValidJdkHome(jdkHome) {
  if (!jdkHome) return false;
  const javacPath = process.platform === "win32"
    ? path.join(jdkHome, "bin", "javac.exe")
    : path.join(jdkHome, "bin", "javac");
  return exists(javacPath);
}

function isValidAndroidSdk(sdkHome) {
  if (!sdkHome) return false;
  const adbPath = process.platform === "win32"
    ? path.join(sdkHome, "platform-tools", "adb.exe")
    : path.join(sdkHome, "platform-tools", "adb");
  return exists(adbPath);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function detectJdkHome() {
  const candidates = [];
  candidates.push(process.env.JAVA_HOME);

  if (process.platform === "win32") {
    candidates.push("C:\\Program Files\\Android\\Android Studio\\jbr");
    candidates.push("F:\\AndroidStudio\\jbr");
    candidates.push("C:\\Program Files\\Android\\Android Studio\\jre");
  }

  const tryWhere = process.platform === "win32" ? "where javac" : "which javac";
  try {
    const out = execSync(tryWhere, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const javacFile of out) {
      const jdkHome = path.dirname(path.dirname(javacFile));
      candidates.push(jdkHome);
    }
  } catch {
    // ignore
  }

  const valid = unique(candidates).find(isValidJdkHome);
  return valid || null;
}

function detectAndroidSdkHome() {
  const candidates = [];
  candidates.push(process.env.ANDROID_HOME);
  candidates.push(process.env.ANDROID_SDK_ROOT);
  candidates.push(path.join(os.homedir(), "AppData", "Local", "Android", "Sdk"));
  candidates.push("F:\\Android\\Sdk");
  candidates.push("C:\\Android\\Sdk");

  const valid = unique(candidates).find(isValidAndroidSdk);
  return valid || null;
}

function toGradlePath(value) {
  return value.replace(/\\/g, "\\\\");
}

function writeLocalProperties(sdkHome) {
  const file = path.join(androidDir, "local.properties");
  const content = `sdk.dir=${toGradlePath(sdkHome)}\n`;
  fs.writeFileSync(file, content, "utf8");
}

function upsertGradleUserProperty(key, value) {
  const gradleDir = path.join(os.homedir(), ".gradle");
  fs.mkdirSync(gradleDir, { recursive: true });
  const file = path.join(gradleDir, "gradle.properties");

  let lines = [];
  if (exists(file)) {
    lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  }

  const record = `${key}=${toGradlePath(value)}`;
  const index = lines.findIndex((line) => line.trim().startsWith(`${key}=`));
  if (index >= 0) {
    lines[index] = record;
  } else {
    lines.push(record);
  }

  const next = lines.join("\n").trimEnd() + "\n";
  fs.writeFileSync(file, next, "utf8");
}

function upsertProjectGradleProperty(key, value) {
  const file = path.join(androidDir, "gradle.properties");
  let lines = [];
  if (exists(file)) {
    lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  }

  const record = `${key}=${toGradlePath(value)}`;
  const index = lines.findIndex((line) => line.trim().startsWith(`${key}=`));
  if (index >= 0) {
    lines[index] = record;
  } else {
    lines.push(record);
  }

  const next = lines.join("\n").trimEnd() + "\n";
  fs.writeFileSync(file, next, "utf8");
}

function fail(message) {
  console.error(`[android-setup] ${message}`);
  if (!softMode) process.exit(1);
}

function main() {
  const jdkHome = detectJdkHome();
  const sdkHome = detectAndroidSdkHome();

  if (!jdkHome) {
    fail(
      "Khong tim thay JDK hop le (can javac). Hay cai Android Studio hoac JDK 17+/21+."
    );
  }
  if (!sdkHome) {
    fail(
      "Khong tim thay Android SDK. Mo Android Studio > SDK Manager de cai va thu lai."
    );
  }

  if (jdkHome) {
    try {
      upsertGradleUserProperty("org.gradle.java.home", jdkHome);
    } catch {
      // Fallback for locked/permission-restricted home dirs.
      upsertProjectGradleProperty("org.gradle.java.home", jdkHome);
    }
  }
  if (sdkHome) {
    writeLocalProperties(sdkHome);
  }

  console.log(`[android-setup] JDK: ${jdkHome ?? "NOT FOUND"}`);
  console.log(`[android-setup] SDK: ${sdkHome ?? "NOT FOUND"}`);
  console.log(
    "[android-setup] Hoan tat. Ban co the chay: npm run android"
  );
}

main();
