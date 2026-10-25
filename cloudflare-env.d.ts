declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    OLLAMA_URL?: string;
    OLLAMA_MODEL?: string;
    BUILD_REVISION?: string;
  }
}
