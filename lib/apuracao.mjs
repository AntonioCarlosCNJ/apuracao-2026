const ELEICAO = "6257";
const TTL_MS = 12000;

const UFS = [
  "ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms",
  "mt", "pa", "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc",
  "se", "sp", "to",
];

const NOMES = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso",
  PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima",
  RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo",
  TO: "Tocantins", BR: "Brasil",
};

function tseUrl(code) {
  const c = code.toLowerCase();
  return `https://resultados.tse.jus.br/oficial/ele2026/${ELEICAO}/dados/${c}/${c}-c0001-e00${ELEICAO}-u.json?_=${Date.now()}`;
}

function brNum(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (!text) return 0;
  if (text.includes(",")) return Number(text.replace(/\./g, "").replace(",", "."));
  return Number(text);
}

function nomeExibicao(numero, nome) {
  if (numero === "13") return "Lula";
  if (numero === "22") return "Flávio Bolsonaro";
  return String(nome || "")
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

function candidatos(doc) {
  const found = [];
  for (const cargo of doc.carg || []) {
    if (String(cargo.cd) !== "1") continue;
    for (const grupo of cargo.agr || []) {
      for (const partido of grupo.par || []) {
        for (const cand of partido.cand || []) {
          const numero = String(cand.n);
          found.push({
            numero,
            nome: nomeExibicao(numero, cand.nmu || cand.nm),
            votos: brNum(cand.vap),
            percentual: brNum(cand.pvap),
          });
        }
      }
    }
  }
  found.sort((a, b) => b.votos - a.votos || a.numero.localeCompare(b.numero));
  return found;
}

function resumir(doc) {
  const lista = candidatos(doc);
  const lula = lista.find((c) => c.numero === "13") || null;
  const flavio = lista.find((c) => c.numero === "22") || null;
  const lider = lista[0] && lista[0].votos > 0 ? lista[0] : null;
  const uf = String(doc.cdabr || "").toUpperCase();
  return {
    uf,
    nome: NOMES[uf] || uf,
    apurado: brNum(doc.s && doc.s.pst),
    secoesApuradas: brNum(doc.s && doc.s.st),
    secoesTotal: brNum(doc.s && doc.s.ts),
    votosValidos: brNum(doc.v && doc.v.vv),
    eleitores: brNum(doc.e && doc.e.te),
    atualizadoEm: `${doc.dt || doc.dg || ""} ${doc.ht || doc.hg || ""}`.trim(),
    lula,
    flavio,
    lider,
  };
}

async function baixar(code) {
  const response = await fetch(tseUrl(code), {
    headers: {
      accept: "application/json",
      "user-agent": "apuracao-2026",
    },
  });
  if (!response.ok) {
    throw new Error(`TSE ${response.status} em ${code}`);
  }
  return resumir(await response.json());
}

let cache = null;
let inflight = null;

export async function atualizar() {
  if (cache && Date.now() - cache.obtidoMs < TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const avisos = [];
    const anteriores = new Map((cache?.estados || []).map((e) => [e.uf, e]));
    const [brasilResult, ...ufResults] = await Promise.allSettled([
      baixar("br"),
      ...UFS.map((uf) => baixar(uf)),
    ]);

    let brasil = cache?.brasil || null;
    if (brasilResult.status === "fulfilled") brasil = brasilResult.value;
    else avisos.push(`Brasil: ${brasilResult.reason.message}`);

    const estados = UFS.map((code, index) => {
      const result = ufResults[index];
      const uf = code.toUpperCase();
      if (result.status === "fulfilled") return result.value;
      avisos.push(`${uf}: ${result.reason.message}`);
      return anteriores.get(uf) || {
        uf,
        nome: NOMES[uf],
        erro: true,
        apurado: 0,
        secoesApuradas: 0,
        secoesTotal: 0,
        votosValidos: 0,
        eleitores: 0,
        atualizadoEm: "",
        lula: null,
        flavio: null,
        lider: null,
      };
    });

    if (!brasil) {
      throw new Error(avisos.join("; ") || "Falha ao consultar o TSE");
    }

    const pacote = {
      fonte: "Tribunal Superior Eleitoral",
      eleicao: ELEICAO,
      turno: 1,
      cargo: "Presidente",
      arquivo: `{uf}-c0001-e00${ELEICAO}-u.json`,
      obtidoEm: new Date().toISOString(),
      obtidoMs: Date.now(),
      avisos,
      brasil,
      estados,
    };
    cache = pacote;
    const b = pacote.brasil;
    console.log(
      `${new Date().toLocaleTimeString("pt-BR")}  ${b.apurado}% seções  Flávio ${b.flavio?.percentual ?? "-"}  Lula ${b.lula?.percentual ?? "-"}`
    );
    return pacote;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
