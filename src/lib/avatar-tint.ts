/**
 * Deterministic soft tint for client avatars. Stable for the lifetime of a
 * client_id so the same person always wears the same color tile.
 */
const TINTS: { bg: string; ring: string; text: string }[] = [
  { bg: "#e8eef8", ring: "#bcd0ed", text: "#1c3a72" },
  { bg: "#eaf3ec", ring: "#bcd9c2", text: "#1f5634" },
  { bg: "#f4ecdc", ring: "#dbc89c", text: "#6b3a02" },
  { bg: "#f4e3e3", ring: "#dfb5b5", text: "#7a1f1f" },
  { bg: "#ebe6f4", ring: "#cfc1e5", text: "#3a1f6e" },
  { bg: "#e6f0f1", ring: "#b5d4d7", text: "#0e4c54" },
  { bg: "#f3e9d6", ring: "#d8c08a", text: "#5a3a05" },
  { bg: "#ecedf3", ring: "#bfc3d8", text: "#1a1f3f" },
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function avatarTint(seed: string) {
  return TINTS[hash(seed) % TINTS.length];
}
