/* J.A.R.V.I.S. HUD — 한 화면, 탭 없음.
 *
 * 음성은 브라우저 로컬 엔진(Web Speech)만 씁니다. 오디오는 서버로 나가지 않고,
 * 서버로 가는 건 인식된 텍스트 한 줄뿐입니다. 서버가 먼저 말을 거는 하루 흐름
 * 알림은 /api/stream (SSE) 으로 받습니다.
 */
"use strict";

const $ = (id) => document.getElementById(id);
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const WAKE_WORDS = ["자비스", "쟈비스", "저비스", "jarvis"];

const state = {
  booted: false,
  listening: false,   // 마이크가 열려 있는가
  pushToTalk: false,  // 스페이스바/버튼으로 누르고 있는가
  speaking: false,
  level: 0,           // 마이크 입력 레벨 0~1
};

/* ------------------------------------------------------------------ 서버 */

async function api(path, options) {
  const started = performance.now();
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  $("net").textContent = `NET ${Math.round(performance.now() - started)}ms`;
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* --------------------------------------------------------------- 상태판 */

function dial(id, value, text) {
  const node = $(id);
  node.style.setProperty("--v", value === null ? 0 : Math.max(0, Math.min(100, value)));
  node.querySelector("b").textContent = text;
}

async function refreshVitals() {
  try {
    const { system, vault } = await api("/api/vitals");
    dial("g-cpu", system.cpu, system.cpu === null ? "—" : `${system.cpu}%`);
    dial("g-ram", system.ram, system.ram === null ? "—" : `${system.ram}%`);
    // I/O 는 ms 단위라 100 스케일이 아닙니다. 10ms 를 만점으로 눌러 표시합니다.
    dial("g-io", system.io_ms >= 0 ? Math.min(99, system.io_ms * 10) : 0,
         system.io_ms >= 0 ? `${system.io_ms}ms` : "—");
    $("sync-bar").style.width = `${vault.sync}%`;
    $("sync-text").textContent = `${vault.sync}% · 링크된 노트 ${vault.linked} / ${vault.total}`;
    $("vault-kv").innerHTML = ["raw", "wiki", "outputs"]
      .map((k) => `<li><span>${k}/</span><b>${vault.by_kind[k] ?? 0}</b></li>`)
      .join("");
  } catch (err) {
    $("sync-text").textContent = "볼트에 연결하지 못했습니다.";
  }
}

async function refreshSchedule() {
  const { blocks } = await api("/api/schedule");
  $("schedule").innerHTML = blocks
    .map((b) => `<li class="${b.done ? "done" : ""} ${b.past ? "past" : ""}">
        <time>${b.at}</time><span>${escapeHtml(b.description)}</span>
        <span class="tick">${b.done ? "✓" : b.past ? "○" : ""}</span></li>`)
    .join("");
}

async function refreshNotes() {
  const { notes } = await api("/api/vault/notes?limit=8");
  $("notes").innerHTML = notes.length
    ? notes.map((n) => `<article class="note">
          <h3>${escapeHtml(n.title)}</h3>
          <p>${escapeHtml(n.excerpt || "(본문 없음)")}</p>
          <div class="tags"><b>${escapeHtml(n.kind)}/</b>${n.tags.map((t) => `<b>#${escapeHtml(t)}</b>`).join("")}</div>
        </article>`).join("")
    : `<p class="muted">볼트가 비어 있습니다. "자비스, 기억해 …" 라고 말해 보세요.</p>`;
}

async function refreshDeck() {
  const { skills } = await api("/api/skills");
  const commands = [...skills.map((s) => ({ name: s.name, label: s.label })), { name: "review", label: "마감 정리" }];
  $("deck").innerHTML = commands
    .map((c) => `<button data-skill="${c.name}"><span>${c.name.toUpperCase()}</span><em>${escapeHtml(c.label)}</em></button>`)
    .join("");
  $("deck").querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", () => runSkill(btn.dataset.skill))
  );
}

/* 대화 로그는 이 배열 하나가 진실입니다. 부팅 때 서버에서 한 번 읽고, 그 뒤로는
   덧붙이기만 합니다 — 다시 읽어 오면 방금 도착한 자동 실행 항목을 덮어씁니다. */
let logLines = [];

function renderLog() {
  $("log").innerHTML = logLines
    .slice(0, 14)
    .map((line) => `<li class="${line.kind || ""}">
        <div class="t">${escapeHtml(line.at)}</div>
        <div class="q">${escapeHtml(line.question)}</div>
        <div class="a">${escapeHtml(line.answer)}</div>
      </li>`)
    .join("");
}

async function loadLog() {
  const { lines } = await api("/api/conversation");
  const known = new Set(logLines.map((l) => l.question + l.answer));
  const restored = lines
    .filter((line) => !known.has(line.question + line.answer))
    .reverse()
    .map((line) => ({ ...line, kind: "" }));
  logLines = logLines.concat(restored);
  renderLog();
}

function addLog(question, answer, kind) {
  // 자동 실행은 서버가 볼트에도 남기므로, 부팅 때 읽어 온 기록과 겹칠 수 있습니다.
  const existing = logLines.find((line) => line.question === question && line.answer === answer);
  if (existing) {
    if (kind) existing.kind = kind;
  } else {
    const at = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
    logLines.unshift({ at, question, answer, kind: kind || "" });
  }
  renderLog();
}

/* ------------------------------------------------------------------ 대화 */

function coreState(text, busy) {
  $("core-state").textContent = text;
  $("core").classList.toggle("busy", Boolean(busy));
}

function present(result, { fromFlow = false } = {}) {
  $("answer").textContent = result.spoken;
  $("answer").classList.toggle("flow", fromFlow);
  $("route-info").textContent = result.skill
    ? `INTENT → ${result.skill.toUpperCase()}${result.label ? ` (${result.label})` : ""}${result.reason ? ` · ${result.reason}` : ""}`
    : result.label || "";
  speak(result.spoken);
  refreshNotes();
  refreshSchedule();
  refreshVitals();
}

async function ask(text) {
  const clean = text.trim();
  if (!clean) return;
  $("heard").textContent = `"${clean}"`;
  $("heard").classList.remove("interim");
  $("answer").textContent = "…";
  coreState("THINKING", true);
  try {
    const result = await api("/api/ask", { method: "POST", body: JSON.stringify({ text: clean }) });
    present(result);
    addLog(clean, result.spoken);
  } catch (err) {
    $("answer").textContent = "요청을 처리하지 못했습니다. 서버 로그를 확인하세요.";
  } finally {
    coreState(state.listening ? "LISTENING" : "STANDBY", false);
  }
}

async function runSkill(name) {
  $("heard").textContent = `[${name}]`;
  $("answer").textContent = "…";
  coreState("RUNNING", true);
  try {
    const result = await api(`/api/run/${name}`, { method: "POST" });
    present({ ...result, label: "COMMAND DECK" });
    addLog(`[${name}]`, result.spoken);
  } catch (err) {
    $("answer").textContent = `'${name}' 스킬 실행에 실패했습니다.`;
  } finally {
    coreState(state.listening ? "LISTENING" : "STANDBY", false);
  }
}

/* --------------------------------------------- 서버가 먼저 말을 거는 통로 */

function openStream() {
  const source = new EventSource("/api/stream");
  source.onopen = () => { $("link").textContent = "LINK 연결됨"; $("link").classList.add("live"); };
  source.onerror = () => { $("link").textContent = "LINK 재연결…"; $("link").classList.remove("live"); };
  source.onmessage = (event) => {
    let payload;
    try { payload = JSON.parse(event.data); } catch (_) { return; }
    if (payload.kind !== "flow") return;   // 내가 물어본 답은 이미 화면에 있습니다.
    present({ spoken: payload.spoken, skill: payload.skill, label: `${payload.at_time} 자동 실행` }, { fromFlow: true });
    addLog(`${payload.at_time} ${payload.description}`, payload.spoken, "flow");
  };
}

/* ------------------------------------------------------------ 보이스 (로컬) */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let restartTimer = null;

const alwaysOn = () => $("always-on").checked;
const speakOn = () => $("speak-on").checked;

function audioState(text) { $("audio-state").textContent = text; }

function wakeChip(text, cls) {
  const chip = $("wake");
  chip.textContent = text;
  chip.className = `chip chip-wake ${cls || ""}`;
}

function stripWakeWord(text) {
  const lower = text.toLowerCase().trim();
  for (const word of WAKE_WORDS) {
    const at = lower.indexOf(word);
    if (at !== -1) return text.slice(at + word.length).replace(/^[\s,.!?~]+/, "").trim();
  }
  return null;
}

function speak(text) {
  if (!speakOn() || !("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ko-KR";
  utter.rate = 1.05;
  utter.onstart = () => { state.speaking = true; audioState("LOCAL · TTS 재생 중"); };
  utter.onend = () => { state.speaking = false; audioState(micLabel()); };
  speechSynthesis.speak(utter);
}

function micLabel() {
  if (!state.listening) return "LOCAL · STT 대기 · TTS 대기";
  return state.pushToTalk ? "LOCAL · STT 수신 (누르고 말하기)" : "LOCAL · STT 상시 수신";
}

function initVoice() {
  if (!SR) {
    audioState("이 브라우저는 로컬 STT 를 지원하지 않습니다. 입력창을 쓰세요.");
    wakeChip("WAKE · 미지원");
    $("mic").disabled = true;
    $("always-on").checked = false;
    $("always-on").disabled = true;
    return false;
  }
  recognition = new SR();
  recognition.lang = "ko-KR";
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onstart = () => {
    state.listening = true;
    $("mic").classList.toggle("on", state.pushToTalk);
    wakeChip(state.pushToTalk ? "WAKE · 듣는 중" : 'WAKE · "자비스" 대기', "on");
    coreState("LISTENING");
    audioState(micLabel());
  };

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0].transcript.trim();
      if (!result.isFinal) { interim += text; continue; }
      handleUtterance(text);
    }
    if (interim) {
      $("heard").textContent = `"${interim}"`;
      $("heard").classList.add("interim");
      if (!state.pushToTalk && stripWakeWord(interim) !== null) wakeChip("WAKE · 호출됨", "hot");
    }
  };

  recognition.onerror = (event) => {
    if (event.error === "no-speech" || event.error === "aborted") return;  // 조용한 구간은 정상입니다.
    if (event.error === "not-allowed") {
      $("always-on").checked = false;
      wakeChip("WAKE · 권한 없음");
      audioState("마이크 권한이 없습니다. 주소창 왼쪽 자물쇠에서 허용해 주세요.");
      return;
    }
    audioState(`STT 오류: ${event.error}`);
  };

  recognition.onend = () => {
    state.listening = false;
    state.pushToTalk = false;
    $("mic").classList.remove("on");
    coreState("STANDBY");
    audioState(micLabel());
    // 상시 대기: 엔진이 스스로 끊어도 다시 붙입니다.
    if (alwaysOn()) {
      wakeChip('WAKE · "자비스" 대기', "on");
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => startListening(), 400);
    } else {
      wakeChip("WAKE · 꺼짐");
      stopWave();
    }
  };
  return true;
}

function handleUtterance(text) {
  $("heard").classList.remove("interim");
  if (state.pushToTalk) { ask(text); return; }

  const command = stripWakeWord(text);
  if (command === null) {          // 호출 없이 오간 말은 흘려 보냅니다.
    $("heard").textContent = `(대기 중: "${text}")`;
    return;
  }
  wakeChip("WAKE · 호출됨", "hot");
  ask(command || "자비스");        // 이름만 불렀으면 대답만 합니다.
  setTimeout(() => wakeChip('WAKE · "자비스" 대기', "on"), 1200);
}

function startListening() {
  if (!recognition || state.listening) return;
  try { recognition.start(); startWave(); } catch (_) { /* 이미 시작됨 */ }
}

function stopListening() {
  if (recognition && state.listening) recognition.stop();
}

function pressToTalk(on) {
  if (!recognition) return;
  if (on) {
    speechSynthesis.cancel();
    state.pushToTalk = true;
    if (state.listening) { recognition.stop(); }   // 상시 대기를 끊고 곧바로 다시 엽니다.
    setTimeout(startListening, 120);
    $("mic").classList.add("on");
    wakeChip("WAKE · 듣는 중", "hot");
  } else {
    state.pushToTalk = false;
    stopListening();
  }
}

/* --------------------------------------------------- 마이크 레벨 · 파형 */

let audioCtx, analyser, micStream, waveTimer;

async function startWave() {
  if (analyser) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    audioCtx.createMediaStreamSource(micStream).connect(analyser);
    drawWave();
  } catch (_) {
    audioState("마이크 권한이 없어 파형을 그리지 않습니다.");
  }
}

function drawWave() {
  const canvas = $("wave");
  const ctx = canvas.getContext("2d");
  const bins = new Uint8Array(analyser.frequencyBinCount);
  const paint = () => {
    canvas.width = canvas.clientWidth;
    analyser.getByteFrequencyData(bins);
    let sum = 0;
    for (const v of bins) sum += v;
    state.level = Math.min(1, sum / bins.length / 90);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width / bins.length;
    for (let i = 0; i < bins.length; i += 1) {
      const h = (bins[i] / 255) * canvas.height;
      ctx.fillStyle = state.pushToTalk ? "#35d6a4" : "#3b9dff";
      ctx.fillRect(i * w, canvas.height - h, Math.max(1, w - 1), h);
    }
    waveTimer = requestAnimationFrame(paint);
  };
  paint();
}

function stopWave() {
  if (waveTimer) cancelAnimationFrame(waveTimer);
  micStream?.getTracks().forEach((t) => t.stop());
  analyser = null;
  micStream = null;
  state.level = 0;
  const canvas = $("wave");
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

/* ------------------------------------------------------------ 아크 리액터 */

function drawReactor() {
  const canvas = $("reactor");
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const mid = size / 2;

  const frame = (time) => {
    const t = time / 1000;
    const energy = state.speaking ? 0.75 : state.listening ? 0.35 + state.level * 0.65 : 0.18;
    ctx.clearRect(0, 0, size, size);

    // 바깥 눈금
    ctx.save();
    ctx.translate(mid, mid);
    ctx.rotate(REDUCED ? 0 : t * 0.12);
    ctx.strokeStyle = "#16304f";
    ctx.lineWidth = 1;
    for (let i = 0; i < 72; i += 1) {
      const long = i % 6 === 0;
      ctx.beginPath();
      ctx.moveTo(0, -mid + 12);
      ctx.lineTo(0, -mid + (long ? 28 : 20));
      ctx.stroke();
      ctx.rotate((Math.PI * 2) / 72);
    }
    ctx.restore();

    // 회전 링 세 겹
    const rings = [
      { r: mid - 40, from: 0.0, len: 1.7, speed: 0.55, color: "#3b9dff", width: 2 },
      { r: mid - 62, from: 2.4, len: 2.4, speed: -0.38, color: "#2b6fb8", width: 1.5 },
      { r: mid - 84, from: 1.2, len: 1.1, speed: 0.9, color: "#35d6a4", width: 2 },
    ];
    for (const ring of rings) {
      ctx.beginPath();
      const start = ring.from + (REDUCED ? 0 : t * ring.speed);
      ctx.arc(mid, mid, ring.r, start, start + ring.len);
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = 0.35 + energy * 0.65;
      ctx.lineWidth = ring.width;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 정지 링
    ctx.beginPath();
    ctx.arc(mid, mid, mid - 52, 0, Math.PI * 2);
    ctx.strokeStyle = "#12314f";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 코어 — 말하거나 들을수록 밝아집니다.
    const pulse = REDUCED ? 0 : Math.sin(t * 2.4) * 0.04;
    const radius = mid * (0.3 + energy * 0.16 + pulse);
    const glow = ctx.createRadialGradient(mid, mid, radius * 0.15, mid, mid, radius);
    glow.addColorStop(0, `rgba(150, 210, 255, ${0.55 + energy * 0.4})`);
    glow.addColorStop(0.55, `rgba(59, 157, 255, ${0.22 + energy * 0.3})`);
    glow.addColorStop(1, "rgba(59, 157, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(mid, mid, radius, 0, Math.PI * 2);
    ctx.fill();

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ 부팅 */

const BOOT_LINES = [
  "코어 온라인",
  "볼트 마운트 — raw · wiki · outputs",
  "스킬 로드 — inbox · plan · metrics · trends · vault",
  "하루 흐름 스케줄러 연결",
  "로컬 STT / TTS 준비",
];

function runBootLog() {
  const list = $("boot-log");
  BOOT_LINES.forEach((line, i) => {
    setTimeout(() => {
      const li = document.createElement("li");
      li.textContent = line;
      list.append(li);
      setTimeout(() => li.classList.add("ok"), 220);
    }, 260 * i);
  });
}

async function boot() {
  if (state.booted) return;
  state.booted = true;
  $("boot").classList.add("gone");

  const voiceReady = initVoice();
  await loadLog();   // 스트림을 열기 전에 읽어야 방금 온 알림을 덮어쓰지 않습니다.
  openStream();
  if (voiceReady && alwaysOn()) startListening();

  let greeting = "자비스 온라인. 부르시면 대답하겠습니다.";
  try {
    const { blocks } = await api("/api/schedule");
    const next = blocks.find((b) => !b.done);
    if (next) greeting += ` 다음 일정은 ${next.at} ${next.description.split(":")[0]}입니다.`;
  } catch (_) { /* 인사말은 없어도 그만입니다. */ }
  if (!logLines.some((line) => line.kind === "flow")) {
    // 부팅하자마자 자동 실행 알림이 왔다면 그 말을 덮지 않습니다.
    $("answer").textContent = greeting;
    speak(greeting);
  }
}

/* ------------------------------------------------------------------ 배선 */

function tickClock() {
  $("clock").textContent = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

$("boot-go").addEventListener("click", boot);
$("mic").addEventListener("click", () => pressToTalk(!state.pushToTalk));
$("ask-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("ask-input");
  ask(input.value);
  input.value = "";
});
$("always-on").addEventListener("change", () => {
  if (alwaysOn()) startListening();
  else { stopListening(); wakeChip("WAKE · 꺼짐"); }
});
$("speak-on").addEventListener("change", () => { if (!speakOn()) speechSynthesis.cancel(); });

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.repeat) return;
  if (document.activeElement === $("ask-input")) return;
  if (!state.booted) { event.preventDefault(); boot(); return; }
  event.preventDefault();
  pressToTalk(true);
});
document.addEventListener("keyup", (event) => {
  if (event.code !== "Space" || document.activeElement === $("ask-input")) return;
  if (state.pushToTalk) pressToTalk(false);
});

runBootLog();
drawReactor();
tickClock();
setInterval(tickClock, 1000);
refreshDeck();
refreshVitals();
refreshSchedule();
refreshNotes();
setInterval(refreshVitals, 5000);
setInterval(refreshSchedule, 60000);
