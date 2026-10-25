import path from "node:path";

// Keeps Wrangler state, logs and registries inside the checkout (git-ignored)
// and disables Wrangler telemetry.
export function configureToolEnvironment(projectRoot) {
  const runtimeRoot = path.join(projectRoot, ".wrangler", "runtime");
  const defaults = {
    CLOUDFLARE_CF_FETCH_ENABLED: "false",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: path.join(runtimeRoot, "logs"),
    WRANGLER_REGISTRY_PATH: path.join(runtimeRoot, "dev-registry"),
    MINIFLARE_REGISTRY_PATH: path.join(runtimeRoot, "registry"),
  };
  for (const [name, value] of Object.entries(defaults)) process.env[name] ??= value;
}
