/** Temporary password for admin-created staff logins. Shown once or copied. */
export function generateTempPassword(len = 14): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const n = Math.max(8, Math.min(128, Math.floor(len)));
  const arr = new Uint32Array(n);
  crypto.getRandomValues(arr);
  return Array.from(arr, (i) => charset[i % charset.length]).join("");
}
