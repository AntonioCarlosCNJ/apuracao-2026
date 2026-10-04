import { atualizar } from "../../lib/apuracao.mjs";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const key = new Request(`${url.origin}/api/apuracao`, { method: "GET" });
  const edge = typeof caches !== "undefined" ? caches.default : null;
  if (edge) {
    const hit = await edge.match(key);
    if (hit) return hit;
  }

  try {
    const pacote = await atualizar();
    const response = new Response(JSON.stringify({
      ...pacote,
      idadeMs: Date.now() - pacote.obtidoMs,
    }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=15",
      },
    });
    if (edge) context.waitUntil(edge.put(key, response.clone()));
    return response;
  } catch (error) {
    return new Response(JSON.stringify({ erro: error.message }), {
      status: 502,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}
