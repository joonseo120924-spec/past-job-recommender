-- AI 앱 개발팀 · 슈퍼베이스 스키마
-- 실행 방법: Supabase 대시보드 → SQL Editor → 전문 붙여넣기 → Run (한 번만)
-- 이 파일은 몇 번 실행해도 안전합니다 (idempotent).
--
-- 설계 원칙
--  1. 노션은 "사람이 읽는 기록", 슈퍼베이스는 "팀이 읽는 상태" 입니다. 정본은 여전히 저장소(`ai-team/`)입니다.
--  2. team_events 와 team_state 는 **anon 키로 삭제할 수 없습니다.** 기록은 지워지지 않아야 합니다.
--  3. 어느 대화창·기기에서 붙어도 team_now 한 줄만 읽으면 현재 상태를 알 수 있어야 합니다.

-- ─────────────────────────────────────────────
-- 1. 상태 파일 스냅샷 (ai-team/*.md 의 현재 내용)
-- ─────────────────────────────────────────────
create table if not exists public.team_state (
  key        text primary key,                       -- 저장소 기준 상대 경로. 예: 'STATE.md'
  content    text        not null,
  sha256     text        not null,
  bytes      integer     not null,
  branch     text,                                   -- 어느 브랜치의 내용인지
  source     text        not null default 'unknown', -- 'remote-container' | 'windows-local' | ...
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 2. 이벤트 로그 (append-only) — D-021 「회의실 실시간 백업」의 저장소 쪽 구현
-- ─────────────────────────────────────────────
create table if not exists public.team_events (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  cycle  integer,
  day    integer,
  stage  text,                                       -- '① 전략' … '⑥ 출시운영' | '감사'
  kind   text not null check (kind in ('호출','승인','반려','결정','막힘','기록','동기화','감사')),
  actor  text,                                       -- 에이전트 이름. 예: 'system-architect'
  title  text not null,
  body   text,
  ref    text,                                       -- 'D-022' · 커밋 SHA · 'Q-001' 등
  source text not null default 'unknown'
);
create index if not exists team_events_at_idx    on public.team_events (at desc);
create index if not exists team_events_kind_idx  on public.team_events (kind, at desc);

-- ─────────────────────────────────────────────
-- 3. 차단 목록 — 「🔴 차단됨 N건」이 세션마다 유실되던 것을 여기서 한 벌로 관리
-- ─────────────────────────────────────────────
create table if not exists public.team_blockers (
  id          text primary key,                      -- 'B-01' …
  title       text not null,
  detail      text,
  needs_user  boolean     not null default true,     -- 사용자 지시가 있어야 풀리는가
  opened_at   timestamptz not null default now(),
  resolved_at timestamptz,
  resolution  text,
  source      text
);

-- ─────────────────────────────────────────────
-- 4. 한 줄 현재 상태 — 새 대화창이 이것만 읽어도 됩니다
--    security_invoker = on: 뷰가 호출자의 RLS 를 그대로 따르게 합니다 (기본값은 정의자 권한이라 RLS 를 우회함)
-- ─────────────────────────────────────────────
create or replace view public.team_now
with (security_invoker = on) as
select
  (select content    from public.team_state where key = 'STATE.md')                    as state_md,
  (select updated_at from public.team_state where key = 'STATE.md')                    as state_updated_at,
  (select branch     from public.team_state where key = 'STATE.md')                    as branch,
  (select count(*)   from public.team_blockers where resolved_at is null)              as open_blockers,
  (select count(*)   from public.team_blockers where resolved_at is null and needs_user) as blockers_needing_user,
  (select max(at)    from public.team_events)                                          as last_event_at,
  (select title      from public.team_events order by at desc limit 1)                 as last_event_title;

-- ─────────────────────────────────────────────
-- 5. RLS
--    publishable(anon) 키로 읽기·쓰기는 되지만 **삭제는 안 됩니다.**
--    → 이 키를 가진 사람은 누구나 상태를 읽고 덮어쓸 수 있습니다. 지우지는 못합니다.
--    더 잠그려면 아래 anon 정책을 지우고 authenticated 만 남기십시오 (그러면 세션이 로그인해야 합니다).
-- ─────────────────────────────────────────────
alter table public.team_state    enable row level security;
alter table public.team_events   enable row level security;
alter table public.team_blockers enable row level security;

drop policy if exists team_state_read   on public.team_state;
drop policy if exists team_state_insert on public.team_state;
drop policy if exists team_state_update on public.team_state;
create policy team_state_read   on public.team_state for select to anon, authenticated using (true);
create policy team_state_insert on public.team_state for insert to anon, authenticated with check (true);
create policy team_state_update on public.team_state for update to anon, authenticated using (true) with check (true);

drop policy if exists team_events_read   on public.team_events;
drop policy if exists team_events_insert on public.team_events;
create policy team_events_read   on public.team_events for select to anon, authenticated using (true);
create policy team_events_insert on public.team_events for insert to anon, authenticated with check (true);
-- update/delete 정책 없음 = append-only

drop policy if exists team_blockers_read   on public.team_blockers;
drop policy if exists team_blockers_insert on public.team_blockers;
drop policy if exists team_blockers_update on public.team_blockers;
create policy team_blockers_read   on public.team_blockers for select to anon, authenticated using (true);
create policy team_blockers_insert on public.team_blockers for insert to anon, authenticated with check (true);
create policy team_blockers_update on public.team_blockers for update to anon, authenticated using (true) with check (true);

-- ─────────────────────────────────────────────
-- 6. 현재 열려 있는 차단 6건 (2026-08-29 기준) — 처음 한 번 채워 둡니다
-- ─────────────────────────────────────────────
insert into public.team_blockers (id, title, detail, needs_user, source) values
  ('B-01','.claude/ 내부 모순','team-org.md:70 은 "자동 실행이 동작하지 않습니다", daily-app/SKILL.md:68 은 "Routine 이 대화창을 깨우는 방식" 으로 정확. 정확한 문장이 이미 .claude/ 안에 있으므로 옮겨 붙이면 됨',true,'2026-08-11 감사'),
  ('B-02','에이전트 20개의 산출 경로','docs/… handoff/… 로만 적혀 앱 폴더 접두사가 없음. 정의대로 쓰면 저장소 루트에 떨어짐. 판본 드리프트 6 이 여기서 계속 실패',true,'2026-08-11 감사'),
  ('B-03','Routine 프롬프트 교체','ai-team/routine-prompt.md 의 얇은 교체안. 현재 프롬프트는 STATE.md 갱신 단계가 빠진 낡은 복붙본',true,'2026-08-11 감사'),
  ('B-04','handoff/03·04 를 읽는 에이전트 없음','"반드시 읽습니다" 로 명시한 에이전트가 없어 인수인계 사슬에 구멍',true,'2026-08-12 감사'),
  ('B-05','daily-app/SKILL.md 4-1 ↔ 5 순서 결함','노션 미동기화 건수를 노션 정리보다 먼저 쓰게 돼 있어 구조적으로 예측값이 됨. 08-12 치명-1 의 뿌리',true,'2026-08-12 감사'),
  ('B-06','브랜치 분기','Routine·team-sync.ps1·local-windows.md 는 claude/notion-ai-team-import-8tlqr8 을 가리키는데 작업은 claude/notion-ai-agent-team-import-69oi8o 에 있음. 방치하면 08-10 트랙 분기 사고가 브랜치 단위로 재발',true,'2026-08-29 재복원')
on conflict (id) do nothing;
