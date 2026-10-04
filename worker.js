import { respostaApuracao } from "./lib/apuracao.mjs";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/apuracao") {
      return respostaApuracao(request, (promise) => ctx.waitUntil(promise));
    }
    return env.ASSETS.fetch(request);
  },
};
