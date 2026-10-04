import { respostaApuracao } from "../../lib/apuracao.mjs";

export async function onRequest(context) {
  return respostaApuracao(context.request, (promise) => context.waitUntil(promise));
}
