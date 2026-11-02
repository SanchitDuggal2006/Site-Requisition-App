import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const root = new URL("../", import.meta.url);
const dir = new URL("../android-app/", import.meta.url);
const appUrl = process.env.APP_URL;
if (!appUrl || new URL(appUrl).protocol !== "https:")
  throw new Error("APP_URL must be the deployed HTTPS address");
const appId = process.env.APP_ID || "com.sanchitduggal.siterequisitions";
await mkdir(new URL("www/", dir), { recursive: true });
await writeFile(
  new URL("www/index.html", dir),
  "<!doctype html><html><body><p>No connection. Please reopen the app.</p></body></html>",
);
const rootPackage = JSON.parse(
  await readFile(new URL("package.json", root), "utf8"),
);
const capDependencies = Object.fromEntries(
  Object.entries(rootPackage.dependencies).filter(([name]) =>
    name.startsWith("@capacitor/"),
  ),
);
await writeFile(
  new URL("package.json", dir),
  JSON.stringify({
    name: "site-requisitions-android",
    version: rootPackage.version,
    private: true,
    dependencies: capDependencies,
  }),
);
await writeFile(
  new URL("capacitor.config.json", dir),
  JSON.stringify(
    {
      appId,
      appName: "Site Requisitions",
      webDir: "www",
      server: { url: appUrl, cleartext: false },
      android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
      plugins: { SplashScreen: { launchShowDuration: 0 } },
    },
    null,
    2,
  ),
);
const cli = new URL(
  "../node_modules/@capacitor/cli/bin/capacitor",
  import.meta.url,
);
const run = (args) =>
  execFileSync(
    process.execPath,
    [cli.pathname.replace(/^\/(\w:)/, "$1"), ...args],
    { cwd: dir, stdio: "inherit" },
  );
try {
  await access(new URL("android/", dir));
} catch {
  run(["add", "android"]);
}
run(["sync", "android"]);
let vars = await readFile(new URL("android/variables.gradle", dir), "utf8");
vars = vars
  .replace(/minSdkVersion = \d+/, "minSdkVersion = 26")
  .replace(/compileSdkVersion = \d+/, "compileSdkVersion = 36")
  .replace(/targetSdkVersion = \d+/, "targetSdkVersion = 36");
await writeFile(new URL("android/variables.gradle", dir), vars);
let manifest = await readFile(
  new URL("android/app/src/main/AndroidManifest.xml", dir),
  "utf8",
);
manifest = manifest
  .replace(
    'android:allowBackup="true"',
    'android:allowBackup="false" android:usesCleartextTraffic="false"',
  )
  .replace(
    /android:launchMode="singleTask"(?: android:screenOrientation="portrait")*/,
    'android:launchMode="singleTask" android:screenOrientation="portrait"',
  );
await writeFile(
  new URL("android/app/src/main/AndroidManifest.xml", dir),
  manifest,
);
const javaDir = new URL(
  "android/app/src/main/java/" + appId.replaceAll(".", "/") + "/",
  dir,
);
await mkdir(javaDir, { recursive: true });
let java = await readFile(new URL("MainActivity.java", dir), "utf8");
java = java.replace("PACKAGE_NAME", appId);
await writeFile(new URL("MainActivity.java", javaDir), java);
let gradle = await readFile(new URL("android/app/build.gradle", dir), "utf8");
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
gradle = gradle
  .replace(
    /versionCode \d+/,
    `versionCode ${Number(process.env.GITHUB_RUN_NUMBER || 1)}`,
  )
  .replace(/versionName "[^"]+"/, `versionName "${pkg.version}"`);
if (!gradle.includes("SITE_RELEASE_SIGNING"))
  gradle += `\n// SITE_RELEASE_SIGNING\nandroid {\n signingConfigs { release {\n if (System.getenv('KEYSTORE_PATH')) {\n storeFile file(System.getenv('KEYSTORE_PATH'))\n storePassword System.getenv('KEYSTORE_PASSWORD')\n keyAlias System.getenv('KEY_ALIAS')\n keyPassword System.getenv('KEY_PASSWORD')\n }\n } }\n buildTypes { release { if (System.getenv('KEYSTORE_PATH')) signingConfig signingConfigs.release } }\n}\n`;
await writeFile(new URL("android/app/build.gradle", dir), gradle);
const res = new URL("android/app/src/main/res/", dir);
await mkdir(new URL("drawable/", res), { recursive: true });
await writeFile(
  new URL("drawable/ic_site.xml", res),
  '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#17231d" android:pathData="M0,0h108v108h-108z"/><path android:strokeColor="#ffffff" android:strokeWidth="5" android:fillColor="@android:color/transparent" android:pathData="M28,76H80 M35,76V44H73V76 M30,44L54,25L78,44 M48,76V57H60V76"/></vector>',
);
manifest = (
  await readFile(
    new URL("android/app/src/main/AndroidManifest.xml", dir),
    "utf8",
  )
)
  .replaceAll("@mipmap/ic_launcher_round", "@drawable/ic_site")
  .replaceAll("@mipmap/ic_launcher", "@drawable/ic_site");
await writeFile(
  new URL("android/app/src/main/AndroidManifest.xml", dir),
  manifest,
);
console.log("Android wrapper prepared for " + appUrl);
await writeFile(
  new URL("android/app/src/main/res/values/styles.xml", dir),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
 <style name="AppTheme" parent="Theme.AppCompat.Light.NoActionBar">
  <item name="colorPrimary">#21583d</item><item name="colorPrimaryDark">#f6f7f9</item><item name="colorAccent">#21583d</item>
  <item name="android:windowLightStatusBar">true</item><item name="android:statusBarColor">#f6f7f9</item>
 </style>
 <style name="AppTheme.NoActionBar" parent="AppTheme"><item name="windowActionBar">false</item><item name="windowNoTitle">true</item></style>
 <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
  <item name="windowSplashScreenBackground">#f6f7f9</item><item name="windowSplashScreenAnimatedIcon">@drawable/ic_site</item><item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
 </style>
</resources>`,
);
