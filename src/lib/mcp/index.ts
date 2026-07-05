import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listClientsTool from "./tools/list-clients";

// Build the OAuth issuer from the direct Supabase project ref. VITE_SUPABASE_URL
// is rewritten to the `.lovable.cloud` proxy on publish, which mcp-js rejects
// (RFC 8414 issuer mismatch). The project ref survives publish unchanged.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "hive-mcp",
  title: "HIVE",
  version: "0.1.0",
  instructions:
    "HIVE compliance-platform tools. Every call runs as the signed-in HIVE user with row-level security applied. Use `whoami` to verify the connection and `list_clients` to browse clients the user can access.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listClientsTool],
});
