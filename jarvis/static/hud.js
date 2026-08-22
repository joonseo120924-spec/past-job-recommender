/* HUD — 한 화면. 탭 없음.
 * 음성은 브라우저 로컬 엔진(Web Speech)만 씁니다. 오디오는 서버로 나가지 않고,
 * 서버로 가는 건 인식된 텍스트 한 줄뿐입니다.
 */
const $ = (id) => document.getElementById(id);
const api = async (path, options) => {
  const started = performance.now();
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  netChip(Math.round(performance.now() - started));
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
};

function netChip(ms) {
  $("net").textContent = `NET ${ms}ms`;
}

/* ---------------------------------------------------------------- 상태 표시 */

function dial(el, value, suffix = "%") {
  const node = $(el);
  if (value === null || value === undefined) {
    node.style.setProperty("--v", 0);
    node.querySelector("b").textContent = "—";
    return;
  }
  node.style.setProperty("--v", Math.max(0, Math.min(100, value)));
  node.querySelector("b").textContent = `${value}${suffix}`;
}

async function refreshVitals() {
  try {
    const { system, vault } = await api("/api/vitals");
    dial("g-cpu", system.cpu);
    dial("g-ram", system.ram);
    // I/O 는 ms 라 100 스케일이 아닙니다. 10ms 를 만점으로 눌러 표시합니다.
    dial("g-io", system.io_ms >= 0 ? Math.min(99, Math.round(system.io_ms * 10)) : null, "");
    $("g-io").querySelector("b").textContent =
      system.io_ms >= 0 ? `${system.io_ms}ms` : "—";
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
    .map(
      (b) => `<li class="${b.done ? "done" : ""} ${b.past ? "past" : ""}">
        <time>${b.at}</time><span>${b.description}</span>
        <span class="tick">${b.done ? "✓" : b.past ? "○" : ""}</span></li>`
    )
    .join("");
}

async function refreshNotes() {
  const { notes } = await api("/api/vault/notes?limit=8");
  $("notes").innerHTML = notes.length
    ? notes
        .map(
          (n) => `<article class="note">
            <h3>${escapeHtml(n.title)}</h3>
            <p>${escapeHtml(n.excerpt || "(본문 없음)")}</p>
            <div class="tags"><b>${n.kind}/</b>${n.tags
            .map((t) => `<b>#${escapeHtml(t)}</b>`)
            .join("")}</div>
          </article>`
        )
        .join("")
    : `<p class="muted">볼트가 비어 있습니다. 아무 말이나 걸어 "기억해 …" 라고 해 보세요.</p>`;
}

async function refreshDeck() {
  const { skills } = await api("/api/skills");
  const commands = [...skills.map((s) => ({ name: s.name, label: s.label })),
                    { name: "review", label: "마감 정리" }];
  $("deck").innerHTML = commands
    .map(
      (c) => `<button data-skill="${c.name}">
        <span>${c.name.toUpperCase()}</span><em>${escapeHtml(c.label)}</em></button>`
    )
    .join("");
  $("deck").querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", () => runSkill(btn.dataset.skill))
  );
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/* ------------------------------------------------------------------ 대화 */

function present({ spoken, skill, label, reason }) {
  $("answer").textContent = spoken;
  $("route-info").textContent = skill
    ? `INTENT → ${skill.toUpperCase()}${label ? ` (${label})` : ""} · ${reason ?? ""}`
    : "";
  speak(spoken);
  refreshNotes();
  refreshSchedule();
  refreshVitals();
}

async function ask(text) {
  if (!text.trim()) return;
  $("heard").textContent = `"${text}"`;
  $("answer").textContent = "…";
  try {
    present(await api("/api/ask", { method: "POST", body: JSON.stringify({ text }) }));
  } catch (err) {
    $("answer").textContent = "요청을 처리하지 못했습니다. 서버 로그를 확인하세요.";
  }
}

async function runSkill(name) {
  $("heard").textContent = `[${name}]`;
  $("answer").textContent = "…";
  try {
    present({ ...(await api(`/api/run/${name}`, { method: "POST" })), reason: "COMMAND DECK" });
  } catch (err) {
    $("answer").textContent = `'${name}' 스킬 실행에 실패했습니다.`;
  }
}

/* ------------------------------------------------------------ 보이스 (로컬) */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

function audioState(text) {
  $("audio-state").textContent = text;
}

function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ko-KR";
  utter.rate = 1.05;
  utter.onstart = () => audioState("LOCAL · TTS 재생 중");
  utter.onend = () => audioState("LOCAL · STT 대기 · TTS 대기");
  speechSynthesis.speak(utter);
}

function initVoice() {
  if (!SR) {
    audioState("이 브라우저는 로컬 STT 를 지원하지 않습니다. 입력창을 쓰세요.");
    $("mic").disabled = true;
    return;
  }
  recognition = new SR();
  recognition.lang = "ko-KR";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    listening = true;
    $("core").classList.add("live");
    $("mic").classList.add("on");
    $("status").textContent = "듣고 있습니다…";
    audioState("LOCAL · STT 수신 중");
  };
  recognition.onresult = (event) => {
    let text = "";
    for (const result of event.results) text += result[0].transcript;
    $("heard").textContent = `"${text}"`;
    if (event.results[event.results.length - 1].isFinal) ask(text);
  };
  recognition.onerror = (event) => {
    audioState(`STT 오류: ${event.error}`);
  };
  recognition.onend = () => {
    listening = false;
    $("core").classList.remove("live");
    $("mic").classList.remove("on");
    $("status").textContent = "스페이스바를 누른 채로 말하세요.";
    audioState("LOCAL · STT 대기 · TTS 대기");
    stopWave();
  };
}

function toggleMic() {
  if (!recognition) return;
  if (listening) recognition.stop();
  else {
    speechSynthesis.cancel();
    try { recognition.start(); startWave(); } catch (_) { /* 이미 시작됨 */ }
  }
}

/* 파형 — 마이크 입력 레벨만 그립니다 (녹음/전송 없음) */
let audioCtx, analyser, waveTimer, micStream;
async function startWave() {
  const canvas = $("wave");
  const ctx = canvas.getContext("2d");
  canvas.width = canvas.clientWidth;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = audioCtx || new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    audioCtx.createMediaStreamSource(micStream).connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(bins);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#3b9dff";
      const w = canvas.width / bins.length;
      bins.forEach((v, i) => {
        const h = (v / 255) * canvas.height;
        ctx.fillRect(i * w, canvas.height - h, Math.max(1, w - 1), h);
      });
      waveTimer = requestAnimationFrame(draw);
    };
    draw();
  } catch (_) {
    audioState("마이크 권한이 없어 파형을 그리지 않습니다.");
  }
}
function stopWave() {
  if (waveTimer) cancelAnimationFrame(waveTimer);
  micStream?.getTracks().forEach((t) => t.stop());
  const canvas = $("wave");
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

/* ------------------------------------------------------------------ 부팅 */

function tickClock() {
  $("clock").textContent = new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat) return;
  if (document.activeElement === $("ask-input")) return;
  e.preventDefault();
  if (!listening) toggleMic();
});
document.addEventListener("keyup", (e) => {
  if (e.code !== "Space") return;
  if (document.activeElement === $("ask-input")) return;
  if (listening) recognition.stop();
});
$("mic").addEventListener("click", toggleMic);
$("ask-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("ask-input");
  ask(input.value);
  input.value = "";
});

initVoice();
tickClock();
setInterval(tickClock, 1000);
refreshDeck();
refreshVitals();
refreshSchedule();
refreshNotes();
setInterval(refreshVitals, 5000);
