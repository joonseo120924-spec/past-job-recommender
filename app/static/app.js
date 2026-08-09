"use strict";

const rolesEl = document.getElementById("roles");
const roleTemplate = document.getElementById("role-template");
const form = document.getElementById("history-form");
const resultsEl = document.getElementById("results");
const errorEl = document.getElementById("error");
const recognitionEl = document.getElementById("recognition");

/** Debounce so typing does not fire a request per keystroke. */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function splitList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function renumberRoles() {
  [...rolesEl.querySelectorAll(".role-card")].forEach((card, i) => {
    card.querySelector(".role-index").textContent = String(i + 1);
    card.querySelector(".remove-role").disabled = rolesEl.children.length === 1;
  });
}

function addRole() {
  rolesEl.appendChild(roleTemplate.content.cloneNode(true));
  renumberRoles();
}

rolesEl.addEventListener("click", (event) => {
  if (!event.target.classList.contains("remove-role")) return;
  if (rolesEl.children.length === 1) return;
  event.target.closest(".role-card").remove();
  renumberRoles();
});

document.getElementById("add-role").addEventListener("click", addRole);

function collectPayload() {
  const past_roles = [...rolesEl.querySelectorAll(".role-card")].map((card) => ({
    title: card.querySelector(".title").value.trim(),
    industry: card.querySelector(".industry").value.trim() || null,
    start_date: card.querySelector(".start-date").value,
    end_date: card.querySelector(".end-date").value || null,
    skills: splitList(card.querySelector(".skills").value),
    achievements: card.querySelector(".achievements").value.trim(),
  }));

  return {
    past_roles,
    preferred_industries: splitList(
      document.getElementById("preferred-industries").value
    ),
    top_k: Number(document.getElementById("top-k").value),
    include_current_role: document.getElementById("include-current").checked,
  };
}

async function postJSON(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) {
    const detail = (body.detail || [])
      .map((d) => `${d.field}: ${d.message}`)
      .join("\n");
    throw new Error([body.message_ko || "요청에 실패했습니다.", detail].filter(Boolean).join("\n"));
  }
  return body;
}

/**
 * Preview what the engine understood while the user is still editing.
 * Unrecognized skills are the main silent failure mode, so they are surfaced
 * before the user commits to a recommendation.
 */
const previewRecognition = debounce(async () => {
  const payload = collectPayload();
  const usable = payload.past_roles.filter((r) => r.title && r.start_date);
  if (usable.length === 0) {
    recognitionEl.hidden = true;
    return;
  }
  try {
    const profile = await postJSON("/api/normalize", {
      ...payload,
      past_roles: usable,
    });
    renderRecognition(profile);
  } catch {
    recognitionEl.hidden = true; // Preview is best-effort; never block typing.
  }
}, 400);

form.addEventListener("input", previewRecognition);

function renderRecognition(profile) {
  const parts = [];
  parts.push(
    `<strong>인식된 경력</strong> 총 ${profile.total_years.toFixed(1)}년 ` +
      `(최근성 반영 환산 ${profile.effective_years.toFixed(1)}년)`
  );

  const matched = profile.experiences
    .map((exp) =>
      exp.matched_title_ko
        ? `${escapeHtml(exp.title)} → <em>${escapeHtml(exp.matched_title_ko)}</em>`
        : `${escapeHtml(exp.title)} → <span class="unmatched">직무 미인식</span>`
    )
    .join(", ");
  parts.push(`<strong>직무 매칭</strong> ${matched}`);

  if (profile.recognized_skills.length) {
    parts.push(
      `<strong>인식된 스킬 ${profile.recognized_skills.length}개</strong> ` +
        profile.recognized_skills.map(escapeHtml).join(", ")
    );
  }
  if (profile.unresolved_inputs.length) {
    parts.push(
      `<strong class="warn">인식하지 못한 입력</strong> ` +
        profile.unresolved_inputs.map(escapeHtml).join(", ") +
        ` <span class="hint">— 자동완성 목록의 표기로 바꾸면 추천 정확도가 올라갑니다.</span>`
    );
  }
  recognitionEl.innerHTML = parts.map((p) => `<p>${p}</p>`).join("");
  recognitionEl.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  resultsEl.innerHTML = `<p class="loading">추천을 계산하는 중…</p>`;
  try {
    const data = await postJSON("/api/recommend", collectPayload());
    renderResults(data);
  } catch (err) {
    resultsEl.innerHTML = "";
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]);
}

function skillChip(item, kind) {
  const partial =
    kind === "gap" && item.evidence_skill
      ? ` <span class="evidence">← ${escapeHtml(item.evidence_skill)} 일부 인정</span>`
      : "";
  return `<li class="chip ${kind}">${escapeHtml(item.skill)}${partial}</li>`;
}

function renderResults(data) {
  renderRecognition(data.profile);

  if (!data.recommendations.length) {
    resultsEl.innerHTML = `<p class="empty">추천할 직무를 찾지 못했습니다.</p>`;
    return;
  }

  const cards = data.recommendations
    .map((rec) => {
      const readiness = Math.round(rec.readiness * 100);
      return `
      <article class="result-card">
        <header>
          <span class="rank">${rec.rank}위</span>
          <h3>${escapeHtml(rec.title_ko)}</h3>
          <span class="meta">${escapeHtml(rec.family)} · ${escapeHtml(rec.seniority)}</span>
        </header>

        <div class="readiness">
          <div class="readiness-bar"><span style="width:${readiness}%"></span></div>
          <span class="readiness-label">역량 충족 ${readiness}%</span>
          <span class="score" title="순위 비교용 상대 지표입니다">적합도 지수 ${rec.score}</span>
        </div>

        <p class="summary">${escapeHtml(rec.summary_ko)}</p>
        <p class="explanation">${escapeHtml(rec.explanation_ko)}</p>
        <ul class="bullets">
          ${rec.explanation_bullets_ko.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
        </ul>

        <div class="skills-block">
          <h4>보유 역량</h4>
          <ul class="chips">${rec.matched_skills.map((s) => skillChip(s, "matched")).join("") || `<li class="chip empty">없음</li>`}</ul>
        </div>
        <div class="skills-block">
          <h4>보완할 역량</h4>
          <ul class="chips">${rec.skill_gaps.map((s) => skillChip(s, "gap")).join("") || `<li class="chip empty">없음</li>`}</ul>
        </div>
      </article>`;
    })
    .join("");

  resultsEl.innerHTML = `
    <h2>추천 결과</h2>
    <p class="disclaimer">적합도 지수는 후보 직무를 <strong>서로 비교</strong>하기 위한 상대 지표입니다. 절대 점수로 읽지 마세요.</p>
    ${cards}`;
}

async function loadOptions() {
  const [skills, industries] = await Promise.all([
    fetch("/api/skills?limit=100").then((r) => r.json()),
    fetch("/api/industries").then((r) => r.json()),
  ]);
  document.getElementById("skill-options").innerHTML = skills
    .map((s) => `<option value="${escapeHtml(s)}">`)
    .join("");
  document.getElementById("industry-options").innerHTML = industries
    .map((s) => `<option value="${escapeHtml(s)}">`)
    .join("");
}

addRole();
loadOptions().catch(() => {
  /* Autocomplete is a convenience; the form works without it. */
});
