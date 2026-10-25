declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    AI?: Ai;
    WORKERS_AI_MODEL?: string;
    OLLAMA_URL?: string;
    OLLAMA_MODEL?: string;
    BUILD_REVISION?: string;
  }
}
