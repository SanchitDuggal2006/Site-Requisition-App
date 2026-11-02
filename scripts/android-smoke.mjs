import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
const id = "com.sanchitduggal.siterequisitions";
const adb = (...args) => execFileSync("adb", args, { encoding: "utf8" });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("android-evidence", { recursive: true });
const apk = readdirSync("apk").find((n) => n.endsWith(".apk"));
if (!apk) throw new Error("Signed APK missing");
adb("install", "-r", "apk/" + apk);
const launch = () => adb("shell", "am", "start", "-n", id + "/.MainActivity");
const capture = (name) => {
  writeFileSync(
    "android-evidence/" + name + ".png",
    execFileSync("adb", ["exec-out", "screencap", "-p"]),
  );
};
async function screenContaining(text) {
  for (let n = 0; n < 30; n++) {
    adb("shell", "uiautomator", "dump", "/sdcard/sr-window.xml");
    const xml = adb("shell", "cat", "/sdcard/sr-window.xml");
    if (xml.toLowerCase().includes(text.toLowerCase())) return xml;
    await pause(1500);
  }
  capture("failure");
  throw new Error("Screen did not contain: " + text);
}
launch();
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
