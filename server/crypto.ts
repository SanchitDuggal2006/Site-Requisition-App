const enc = new TextEncoder();
const hex = (a: ArrayBuffer) =>
  Array.from(new Uint8Array(a), (v) => v.toString(16).padStart(2, "0")).join(
    "",
  );
export async function digest(s: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}
