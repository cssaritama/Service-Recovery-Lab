import handler from "vinext/server/fetch-handler";
import { handleApi, type Environment } from "../lib/recovery/api";

// One Worker serves both the JSON API and the server-rendered UI.
const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return handleApi(request, env as unknown as Environment, ctx);
    }
    return handler.fetch(request, env, ctx);
  },
};

export default worker;
