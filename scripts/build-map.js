const fs = require("fs");
const path = require("path");

const src =
  process.argv[2] || path.join(process.env.TEMP || "/tmp", "brazil-states.geojson");
const out = path.join(__dirname, "..", "public", "map.json");

const raw = JSON.parse(fs.readFileSync(src, "utf8"));

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
}

function distToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const mag = Math.hypot(dx, dy);
  if (mag === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / mag;
}

function simplify(points, eps) {
  if (points.length <= 2) return points.slice();
  let maxD = 0;
  let idx = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = distToSegment(points[i], points[0], points[end]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = simplify(points.slice(0, idx + 1), eps);
    const right = simplify(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

function decimate(ring, maxPts) {
  const closed =
    ring.length > 2 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const open = closed ? ring.slice(0, -1) : ring.slice();
  if (open.length <= maxPts) return open;
  const step = Math.ceil(open.length / maxPts);
  const outPts = [];
  for (let i = 0; i < open.length; i += step) outPts.push(open[i]);
  return outPts;
}

function polygonsOf(geom) {
  if (geom.type === "Polygon") return [geom.coordinates];
  if (geom.type === "MultiPolygon") return geom.coordinates;
  return [];
}

const kx = Math.cos((-14 * Math.PI) / 180);
function project(lon, lat) {
  return [lon * kx, -lat];
}

const prepared = [];

for (const feature of raw.features) {
  const uf = String(feature.properties.sigla || "").toUpperCase();
  const nome = feature.properties.name;
  const polygons = polygonsOf(feature.geometry).map((poly) => ({
    rings: poly,
    area: ringArea(poly[0]),
  }));
  const maxArea = polygons.reduce((m, p) => Math.max(m, p.area), 0);
  const kept = [];
  for (const poly of polygons) {
    if (maxArea > 0 && poly.area < maxArea * 0.012) continue;
    const rings = [];
    poly.rings.forEach((ring, ringIndex) => {
      if (ringIndex > 0 && ringArea(ring) < maxArea * 0.012) return;
      const reduced = decimate(ring, 450);
      const simple = simplify(reduced, 0.03);
      if (simple.length >= 3) {
        simple.push(simple[0]);
        rings.push(simple);
      }
    });
    if (rings.length) kept.push(rings);
  }
  prepared.push({ uf, nome, polygons: kept });
}

let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
for (const state of prepared) {
  for (const rings of state.polygons) {
    for (const ring of rings) {
      for (const [lon, lat] of ring) {
        const [x, y] = project(lon, lat);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
}

const targetH = 640;
const scale = targetH / (maxY - minY);
const pad = 12;

function toSvg(lon, lat) {
  const [x, y] = project(lon, lat);
  return [(x - minX) * scale + pad, (y - minY) * scale + pad];
}

function centroid(ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const pts = ring.map(([lon, lat]) => toSvg(lon, lat));
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-6) {
    const [x, y] = pts[0];
    return [x, y];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

const states = prepared.map((state) => {
  let d = "";
  let minSX = Infinity;
  let minSY = Infinity;
  let maxSX = -Infinity;
  let maxSY = -Infinity;
  let best = null;
  let bestArea = -1;
  for (const rings of state.polygons) {
    const area = ringArea(rings[0]);
    if (area > bestArea) {
      bestArea = area;
      best = rings[0];
    }
    for (const ring of rings) {
      const pts = ring.map(([lon, lat]) => toSvg(lon, lat));
      for (const [x, y] of pts) {
        if (x < minSX) minSX = x;
        if (y < minSY) minSY = y;
        if (x > maxSX) maxSX = x;
        if (y > maxSY) maxSY = y;
      }
      d += `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        d += `L${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
      }
      d += "Z";
    }
  }
  const [cx, cy] = centroid(best);
  return {
    uf: state.uf,
    nome: state.nome,
    d,
    cx: Number(cx.toFixed(1)),
    cy: Number(cy.toFixed(1)),
    minX: Number(minSX.toFixed(1)),
    minY: Number(minSY.toFixed(1)),
    maxX: Number(maxSX.toFixed(1)),
    maxY: Number(maxSY.toFixed(1)),
  };
});

const width = Math.ceil(maxX === -Infinity ? 0 : (maxX - minX) * scale + pad * 2);
const height = Math.ceil(targetH + pad * 2);
const map = { width, height, states };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(map));

const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`map ${width}x${height}  ${states.length} estados  ${kb} KB`);
for (const s of states) {
  const bw = (s.maxX - s.minX).toFixed(0);
  const bh = (s.maxY - s.minY).toFixed(0);
  console.log(`${s.uf}  ${bw}x${bh}  @${s.cx},${s.cy}`);
}
