import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
const id = "com.sanchitduggal.siterequisitions";
const adb = (...args) =>
  execFileSync("adb", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("android-evidence", { recursive: true });
const apk = readdirSync("apk").find((n) => n.endsWith(".apk"));
if (!apk) throw new Error("Signed APK missing");
const previous = readdirSync("apk-previous").find((n) => n.endsWith(".apk"));
if (!previous) throw new Error("Previous signed APK missing for upgrade check");
adb("install", "-r", "apk-previous/" + previous);
adb("install", "-r", "apk/" + apk);
writeFileSync(
  "android-evidence/upgrade.txt",
  "PASS: previous signed APK installed, then updated in place to the new release with adb install -r.\n",
);
const launch = () => adb("shell", "am", "start", "-n", id + "/.MainActivity");
const capture = (name) => {
  writeFileSync(
    "android-evidence/" + name + ".png",
    execFileSync("adb", ["exec-out", "screencap", "-p"]),
  );
};
async function screenContaining(text) {
  for (let n = 0; n < 30; n++) {
    try {
      adb("shell", "uiautomator", "dump", "/sdcard/sr-window.xml");
      const xml = adb("shell", "cat", "/sdcard/sr-window.xml");
      if (xml.toLowerCase().includes(text.toLowerCase())) return xml;
    } catch {
      /* Accessibility service may not be ready immediately after launch. */
    }
    await pause(1500);
  }
  capture("failure");
  writeFileSync(
    "android-evidence/logcat.txt",
    adb("logcat", "-d", "-t", "2000"),
  );
  writeFileSync(
    "android-evidence/webview.txt",
    adb("shell", "dumpsys", "webviewupdate"),
  );
  throw new Error("Screen did not contain: " + text);
}
launch();
const webview = adb("shell", "dumpsys", "webviewupdate");
writeFileSync("android-evidence/webview.txt", webview);
const webviewVersion = Number(
  webview.match(/Current WebView package[^\n]*,\s*(\d+)\./)?.[1] || 0,
);
if (!webviewVersion)
  throw new Error("Could not determine emulator WebView version");
if (webviewVersion < 108) {
  await screenContaining("Update Android System WebView");
  capture("webview-update");
  writeFileSync(
    "android-evidence/result.txt",
    "PASS: obsolete WebView displays an actionable update screen. App workflows require WebView 108 or later; not exercised on this image.\n",
  );
  process.exit(0);
}
await screenContaining("Sign in");
capture("login");
adb("shell", "input", "keyevent", "4");
await pause(500);
const activities = adb("shell", "dumpsys", "activity", "activities");
const resumed = activities
  .split("\n")
  .filter((l) => /mResumedActivity|topResumedActivity/.test(l))
  .join(" ");
if (resumed.includes(id)) throw new Error("Root back did not exit");
adb("shell", "svc", "wifi", "disable");
adb("shell", "svc", "data", "disable");
adb("shell", "am", "force-stop", id);
launch();
await screenContaining("No connection. Try again");
capture("offline");
adb("shell", "svc", "wifi", "enable");
adb("shell", "svc", "data", "enable");
writeFileSync(
  "android-evidence/result.txt",
  "PASS: signed APK installed; deployed login loaded; root back exited; offline Retry screen appeared. Nested back and physical-device checks remain manual.\n",
);
