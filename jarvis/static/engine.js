/* OPTIMAL ENGINE — 지식 코어 그래프.
 *
 * 서버는 무엇이 무엇과 이어져 있는지만 줍니다. 좌표는 여기서 계산합니다.
 * Radial 은 중심에서 뻗는 동심원, Neural 은 힘 기반 배치입니다.
 * 외부 라이브러리 없이 캔버스 2D 만 씁니다.
 */
"use strict";

const $ = (id) => document.getElementById(id);
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const COLOR = {
  human: "#ffffff",
  agent: "#3b9dff",
  division: "#9d7bff",
  tool: "#ff5f7e",
  artifact: "#35d6a4",
  pillar: "#ffb547",
  state: "#7ba7d6",
  app: "#35d6a4",
  task: "#ff5f7e",
  note: "#6f8bb0",
};
const RADIUS = { human: 9, division: 8, agent: 6, app: 8, tool: 4.5, artifact: 3.5, pillar: 5, state: 4.5, task: 5, note: 4.5 };

const state = {
  graph: { nodes: [], edges: [], clusters: [], legend: [], meta: {} },
  layout: new Map(),      // id → {x, y}
  visible: new Set(),     // 보이는 노드 id
  kinds: new Set(),       // LENS 로 켜 둔 종류
  mode: "radial",
  focus: null,            // 파고든 클러스터 id
  trail: [],              // 브레드크럼
  view: { x: 0, y: 0, scale: 1 },
  hover: null,
  index: new Map(),       // id → 노드
  dirty: true,            // 바뀐 게 있을 때만 다시 그립니다
};

const canvas = $("graph");
const ctx = canvas.getContext("2d");

/* ------------------------------------------------------------------ 데이터 */

async function load() {
  const res = await fetch("/api/graph");
  state.graph = await res.json();
  state.index = new Map(state.graph.nodes.map((node) => [node.id, node]));
  state.graph.legend.forEach((l) => state.kinds.add(l.kind));
  renderRails();
  focusCluster(null);
}

// 엣지 하나마다 93개 노드를 훑으면 프레임마다 3만 번을 뒤집니다.
const byId = (id) => state.index.get(id);

function nodesFor(clusterId) {
  if (!clusterId) return state.graph.nodes;
  const inCluster = state.graph.nodes.filter((n) => n.cluster === clusterId);
  const ids = new Set(inCluster.map((n) => n.id));
  // 클러스터 밖이라도 직접 이어진 것은 함께 보여야 관계가 읽힙니다.
  const neighbours = new Set();
  for (const edge of state.graph.edges) {
    if (ids.has(edge.source) && !ids.has(edge.target)) neighbours.add(edge.target);
    if (ids.has(edge.target) && !ids.has(edge.source)) neighbours.add(edge.source);
  }
  return state.graph.nodes.filter((n) => ids.has(n.id) || neighbours.has(n.id));
}

/* ------------------------------------------------------------------ 레이아웃 */

function computeLayout() {
  const nodes = state.graph.nodes.filter((n) => state.visible.has(n.id));
  state.layout = new Map();
  if (!nodes.length) return;
  if (state.mode === "radial") radialLayout(nodes);
  else neuralLayout(nodes);
  fitView();
  invalidate();
}

/* 배치가 끝나면 화면에 맞춥니다. 파고든 클러스터는 노드가 적어서, 고정 배율로
   두면 텅 빈 화면에 점 몇 개만 떠 있게 됩니다. */
function fitView() {
  const points = [...state.layout.values()];
  if (!points.length) return;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const wrap = $("canvas-wrap");
  const width = Math.max(maxX - minX, 1), height = Math.max(maxY - minY, 1);
  const margin = 110;   // 라벨이 잘리지 않을 만큼
  const scale = Math.min(
    (wrap.clientWidth - margin * 2) / width,
    (wrap.clientHeight - margin * 2) / height
  );
  state.view.scale = Math.max(0.4, Math.min(2.4, scale));
  state.view.x = -(minX + maxX) / 2;
  state.view.y = -(minY + maxY) / 2;
}

function radialLayout(nodes) {
  // 중심 → 본부/사람 → 에이전트 → 나머지. 참조 화면의 동심원 배치입니다.
  const rank = (n) => {
    if (n.core) return 0;
    if (n.kind === "division" || n.kind === "human") return 1;
    if (n.kind === "agent" || n.kind === "app") return 2;
    return 3;
  };
  const rings = [[], [], [], []];
  nodes.forEach((n) => rings[rank(n)].push(n));
  // 노드가 많을수록 링을 넓게 벌려야 겹치지 않습니다.
  const widest = Math.max(...rings.map((r) => r.length), 1);
  const step = Math.max(96, Math.min(190, widest * 7));
  rings.forEach((ring, depth) => {
    if (!ring.length) return;
    if (depth === 0) {
      state.layout.set(ring[0].id, { x: 0, y: 0 });
      return;
    }
    const radius = depth * step;
    ring.forEach((node, index) => {
      // 링마다 살짝 돌려 바퀴살이 겹쳐 보이지 않게 합니다.
      const angle = (index / ring.length) * Math.PI * 2 + depth * 0.4;
      state.layout.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
  });
}

function neuralLayout(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  const pos = new Map();
  nodes.forEach((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2;
    const radius = 120 + (index % 7) * 34;
    pos.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0 });
  });
  const links = state.graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));

  // 짧은 시뮬레이션을 한 번 돌리고 결과를 고정합니다. 계속 흔들리는 그래프는
  // 멋있어 보이지만 읽기 어렵습니다.
  for (let step = 0; step < 260; step += 1) {
    const list = [...pos.values()];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i], b = list[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist2 = dx * dx + dy * dy || 0.01;
        const force = 5200 / dist2;
        const dist = Math.sqrt(dist2);
        dx /= dist; dy /= dist;
        a.vx -= dx * force; a.vy -= dy * force;
        b.vx += dx * force; b.vy += dy * force;
      }
    }
    for (const link of links) {
      const a = pos.get(link.source), b = pos.get(link.target);
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist - 96) * 0.012;
      const ux = (dx / dist) * force, uy = (dy / dist) * force;
      a.vx += ux; a.vy += uy;
      b.vx -= ux; b.vy -= uy;
    }
    for (const p of pos.values()) {
      p.vx -= p.x * 0.0016; p.vy -= p.y * 0.0016;   // 중심으로 살짝 당김
      p.x += p.vx * 0.5; p.y += p.vy * 0.5;
      p.vx *= 0.82; p.vy *= 0.82;
    }
  }
  for (const [id, p] of pos) state.layout.set(id, { x: p.x, y: p.y });
}

/* ------------------------------------------------------------------ 그리기 */

function resize() {
  const wrap = $("canvas-wrap");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = wrap.clientWidth * ratio;
  canvas.height = wrap.clientHeight * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function toScreen(point) {
  const wrap = $("canvas-wrap");
  return {
    x: wrap.clientWidth / 2 + (point.x + state.view.x) * state.view.scale,
    y: wrap.clientHeight / 2 + (point.y + state.view.y) * state.view.scale,
  };
}

function draw() {
  const wrap = $("canvas-wrap");
  ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
  const scale = state.view.scale;
  const shown = (id) => state.visible.has(id) && state.kinds.has(byId(id)?.kind);

  // 엣지
  for (const edge of state.graph.edges) {
    if (!shown(edge.source) || !shown(edge.target)) continue;
    const a = state.layout.get(edge.source), b = state.layout.get(edge.target);
    if (!a || !b) continue;
    const p = toScreen(a), q = toScreen(b);
    const touchesHover =
      state.hover && (edge.source === state.hover || edge.target === state.hover);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.strokeStyle = touchesHover ? "#3b9dff" : "#16304f";
    ctx.globalAlpha = touchesHover ? 0.95 : 0.42;
    ctx.lineWidth = touchesHover ? 1.4 : 0.8;
    if (edge.kind === "flow" || edge.kind === "blocks") ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 관계 이름은 파고들었을 때만 — 전체 화면에서는 글자가 서로를 먹습니다.
    if (state.focus && edge.label && scale > 0.75) {
      ctx.globalAlpha = touchesHover ? 0.95 : 0.4;
      ctx.fillStyle = touchesHover ? "#dbe9ff" : "#6f8bb0";
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(edge.label, (p.x + q.x) / 2, (p.y + q.y) / 2 - 3);
    }
  }
  ctx.globalAlpha = 1;

  // 노드
  for (const node of state.graph.nodes) {
    if (!shown(node.id)) continue;
    const point = state.layout.get(node.id);
    if (!point) continue;
    const p = toScreen(point);
    const base = (RADIUS[node.kind] || 4) * (node.core ? 2.4 : 1);
    const r = base * Math.max(0.65, Math.min(scale, 1.7));
    const color = COLOR[node.kind] || "#6f8bb0";
    const isHover = state.hover === node.id;

    if (node.core || node.lead || isHover) {
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
      glow.addColorStop(0, color + "66");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = node.blocking ? "#1a0b12" : "#08131f";
    ctx.fill();
    ctx.lineWidth = node.lead ? 2 : 1.2;
    ctx.strokeStyle = color;
    ctx.stroke();

    if (node.core || node.kind === "division" || node.kind === "human") {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    const label = node.label;
    const showLabel =
      isHover || node.core || node.kind === "division" || node.kind === "human" ||
      (state.focus && scale > 0.7) || scale > 1.5;
    if (showLabel && label) {
      ctx.font = `${node.core || node.kind === "division" ? 11 : 9}px ui-monospace, monospace`;
      ctx.fillStyle = isHover ? "#dbe9ff" : "#8fa9c9";
      ctx.textAlign = "center";
      ctx.fillText(label.slice(0, 26), p.x, p.y - r - 6);
    }
  }
}

function tick() {
  if (state.dirty) {
    draw();
    state.dirty = false;
  }
  requestAnimationFrame(tick);
}

function invalidate() {
  state.dirty = true;
}

/* ------------------------------------------------------------------ 화면 조작 */

function focusCluster(clusterId) {
  state.focus = clusterId;
  const nodes = nodesFor(clusterId);
  state.visible = new Set(nodes.map((n) => n.id));
  computeLayout();
  renderCrumbs();
  renderDirectory();
  renderLens();
  document.querySelectorAll("[data-cluster]").forEach((btn) =>
    btn.classList.toggle("on", btn.dataset.cluster === clusterId)
  );
}

function renderRails() {
  const clusters = state.graph.clusters.filter((c) =>
    !["people", "tools", "pillars"].includes(c.id)
  );
  $("rail-divisions").innerHTML = clusters
    .map((c) => `<li><button type="button" data-cluster="${c.id}">${c.label}<span class="n">${c.count}</span></button></li>`)
    .join("");
  document.querySelectorAll("[data-cluster]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.trail = [{ id: btn.dataset.cluster, label: btn.textContent.replace(/\d+$/, "").trim() }];
      focusCluster(btn.dataset.cluster);
    })
  );

  const counts = state.graph.meta.counts || {};
  $("rail-status").innerHTML =
    `systems live<br />${state.graph.nodes.length} nodes · ${counts.edges || 0} edges<br />` +
    `markdown vault · real agents<br />관측 ${state.graph.meta.observed_at || "—"}`;

  $("legend").innerHTML = state.graph.legend
    .map((l) => `<li><i style="background:${COLOR[l.kind] || "#6f8bb0"}"></i>${l.label}</li>`)
    .join("");
}

function renderLens() {
  const counts = {};
  for (const node of state.graph.nodes) {
    if (!state.visible.has(node.id)) continue;
    counts[node.kind] = (counts[node.kind] || 0) + 1;
  }
  $("lens").innerHTML = state.graph.legend
    .map((l) => `<label><input type="checkbox" data-kind="${l.kind}" ${state.kinds.has(l.kind) ? "checked" : ""} />
        ${l.label}<span class="n">${counts[l.kind] || 0}</span></label>`)
    .join("");
  $("lens").querySelectorAll("input").forEach((input) =>
    input.addEventListener("change", () => {
      if (input.checked) state.kinds.add(input.dataset.kind);
      else state.kinds.delete(input.dataset.kind);
      invalidate();
    })
  );
}

function renderCrumbs() {
  const parts = [`<button type="button" data-crumb="root">ROOT</button>`];
  if (state.focus) {
    const cluster = state.graph.clusters.find((c) => c.id === state.focus);
    parts.push(`<span class="sep">›</span><button type="button" data-crumb="${state.focus}">${cluster ? cluster.label : state.focus}</button>`);
  }
  $("crumbs").innerHTML = parts.join("");
  $("crumbs").querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", () => focusCluster(btn.dataset.crumb === "root" ? null : btn.dataset.crumb))
  );
}

function renderDirectory() {
  const query = ($("search").value || "").trim().toLowerCase();
  const rows = state.graph.nodes
    .filter((n) => ["agent", "human", "division", "app"].includes(n.kind))
    .filter((n) => !query || n.label.toLowerCase().includes(query) || (n.note || "").toLowerCase().includes(query))
    .slice(0, 40);
  $("directory").innerHTML = rows
    .map((n) => `<li><button type="button" data-node="${n.id}">${n.label}<em>${n.model || n.kind}</em></button></li>`)
    .join("");
  $("directory").querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", () => {
      const node = byId(btn.dataset.node);
      if (node?.cluster) focusCluster(node.cluster);
      state.hover = node.id;
      showTip(node, null);
      invalidate();
    })
  );
}

function showTip(node, event) {
  const tip = $("tip");
  if (!node) { tip.hidden = true; return; }
  const kindLabel = state.graph.legend.find((l) => l.kind === node.kind)?.label || node.kind;
  tip.innerHTML =
    `<b>${node.label}</b><span>${kindLabel}${node.model ? " · " + node.model : ""}` +
    `${node.lead ? " · 파트장" : ""}</span>${node.note ? "<div>" + node.note + "</div>" : ""}`;
  tip.hidden = false;
  const wrap = $("canvas-wrap").getBoundingClientRect();
  const point = state.layout.get(node.id);
  const anchor = event
    ? { x: event.clientX - wrap.left, y: event.clientY - wrap.top }
    : point ? toScreen(point) : { x: 20, y: 20 };
  tip.style.left = `${Math.min(anchor.x + 14, wrap.width - 300)}px`;
  tip.style.top = `${Math.min(anchor.y + 12, wrap.height - 110)}px`;
}

function pick(event) {
  const wrap = $("canvas-wrap").getBoundingClientRect();
  const mx = event.clientX - wrap.left, my = event.clientY - wrap.top;
  let best = null, bestDist = 18;
  for (const node of state.graph.nodes) {
    if (!state.visible.has(node.id) || !state.kinds.has(node.kind)) continue;
    const point = state.layout.get(node.id);
    if (!point) continue;
    const p = toScreen(point);
    const dist = Math.hypot(p.x - mx, p.y - my);
    if (dist < bestDist) { best = node; bestDist = dist; }
  }
  return best;
}

/* ------------------------------------------------------------------ 입력 */

let dragging = false, last = null;

canvas.addEventListener("mousedown", (event) => {
  dragging = true; last = { x: event.clientX, y: event.clientY };
  canvas.classList.add("dragging");
});
window.addEventListener("mouseup", () => { dragging = false; canvas.classList.remove("dragging"); });
canvas.addEventListener("mousemove", (event) => {
  if (dragging && last) {
    state.view.x += (event.clientX - last.x) / state.view.scale;
    state.view.y += (event.clientY - last.y) / state.view.scale;
    last = { x: event.clientX, y: event.clientY };
    invalidate();
    return;
  }
  const node = pick(event);
  const hovered = node ? node.id : null;
  if (hovered !== state.hover) invalidate();
  state.hover = hovered;
  showTip(node, event);
});
canvas.addEventListener("mouseleave", () => { state.hover = null; showTip(null); invalidate(); });
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.12 : 0.89;
  state.view.scale = Math.max(0.35, Math.min(3.2, state.view.scale * factor));
  invalidate();
}, { passive: false });
canvas.addEventListener("click", (event) => {
  const node = pick(event);
  if (!node) return;
  if (node.cluster && node.cluster !== state.focus) focusCluster(node.cluster);
  else showTip(node, event);
});

$("mode-radial").addEventListener("click", () => setMode("radial"));
$("mode-neural").addEventListener("click", () => setMode("neural"));
function setMode(mode) {
  state.mode = mode;
  $("mode-radial").classList.toggle("on", mode === "radial");
  $("mode-neural").classList.toggle("on", mode === "neural");
  computeLayout();
}

$("reset").addEventListener("click", () => focusCluster(null));
$("full").addEventListener("click", () => {
  const wrap = $("canvas-wrap");
  if (document.fullscreenElement) document.exitFullscreen();
  else wrap.requestFullscreen?.().then(resize).catch(() => {});
});
$("search").addEventListener("input", renderDirectory);

/* 브레인에 쏟아붓기 — 볼트 raw/ 로 들어갑니다. */
$("dump-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("dump");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  input.placeholder = "저장 중…";
  try {
    await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `기억해 ${text}` }),
    });
    input.placeholder = "볼트에 넣었습니다. 계속 쏟아부으세요";
    await load();
  } catch (_) {
    input.placeholder = "저장하지 못했습니다. 서버를 확인하세요";
  }
});

["dragenter", "dragover"].forEach((type) =>
  window.addEventListener(type, (event) => { event.preventDefault(); $("drop").hidden = false; })
);
["dragleave", "drop"].forEach((type) =>
  window.addEventListener(type, (event) => {
    event.preventDefault();
    if (type === "dragleave" && event.relatedTarget) return;
    $("drop").hidden = true;
  })
);
window.addEventListener("drop", async (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const body = await file.text();
  await fetch("/api/vault/notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: file.name.replace(/\.[^.]+$/, ""), body, kind: "raw", type: "drop", tags: ["drop"] }),
  });
  await load();
});

window.addEventListener("resize", () => { resize(); invalidate(); });
document.addEventListener("fullscreenchange", () => { resize(); invalidate(); });

resize();
tick();
load();
