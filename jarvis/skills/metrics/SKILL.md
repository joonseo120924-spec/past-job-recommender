---
name: metrics
label: 지표 확인
triggers: [지표, 수치, 조회수, 구독자, 팔로워, 성과, metrics, 몇 명]
priority: 20
---

# metrics — 수치 확인

`vault/data/metrics.jsonl` 의 최근 두 스냅샷을 비교해 조회수·구독자·팔로워의
변화량을 말합니다. 예측하지 않고, 기록된 숫자만 읽습니다.

- 새 스냅샷 기록: `POST /api/metrics {"views":…, "subscribers":…, "followers":…}`
- 하루 흐름에서 14:00 에 자동으로 호출됩니다.
