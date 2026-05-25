# DocFlow Disaster Recovery Runbook

> 운영 장애 / 데이터 손상 / 보안 사고 발생 시 복구 절차.
> 본 문서는 SRE/플랫폼 담당자가 작업 시 그대로 따른다.
>
> 책임자: SRE on-call.
> 연락: #docflow-ops Slack 채널.

---

## 시나리오 1 — 서버 hard down (API/DB host 통신 불가)

증상: 직원의 HTTP request 가 5xx 또는 timeout. 모니터링 알람 (Caddy access log 0 req/min 등).

### 절차

1. **모니터링 알람 확인** — Sentry/Grafana 알람 메시지 + Caddy access log.
2. **장애 범위 진단**:
   - `docker ps` (API 컨테이너 상태) — exit code 확인.
   - `docker exec docflow-postgres pg_isready` — DB 응답 여부.
   - host disk/memory: `df -h`, `free -h`.
3. **단순 재시작**: 90% 케이스는 컨테이너 재시작으로 복구.
   `docker compose -f infra/docker-compose.prod.yml restart api`.
4. **DB host down**: 백업 host 로 fail-over.
   - 가장 최근 streaming replica (있는 경우) 를 promote.
   - 또는 가장 최근 백업 dump 로 §시나리오 2 절차.
5. **DNS 전환** (호스트 통째 교체 시): Cloudflare/Route53 에서 A record 변경 → TTL 60s 기준 약 1분.
6. **직원 공지**: Slack `#공지` 채널 정해진 템플릿:
   ```
   [장애 안내] DocFlow 일시 접속 불가
   - 시작 시각: HH:MM
   - 영향 범위: 출퇴근 / 휴가 / 캘린더
   - 임시 안내: <오늘 출퇴근은 팀장에게 SMS 통보>
   - 복구 예상: HH:MM
   ```
7. **복구 후 회고**: 24h 내 회고록 (timeline + root cause + prevention) → `docs/03-review/`.

---

## 시나리오 2 — DB 데이터 손상 (delete/update 사고)

증상: HR/super_admin 의 실수 DELETE, 또는 마이그레이션 사고로 row 누락 발견.

### 절차

1. **즉시 write 차단**: API 컨테이너 stop + Caddy maintenance page 활성.
   `docker compose stop api`
   `curl -X POST http://caddy:2019/load -d @infra/caddy-maint.json` (사전 준비 필요).
2. **외부 SaaS redirect** (병행 운영 기간 한정, P1 첫 1~2주만): 사내 공지로 외부 SaaS 임시 사용 안내.
3. **백업 dump 식별**:
   - `ls -lt /backup/docflow-*.dump | head` — 사고 직전 dump 선택.
4. **새 DB 로 복원**:
   ```bash
   docker exec docflow-postgres createdb -U docflow docflow_restore
   docker exec -i docflow-postgres pg_restore -U docflow -d docflow_restore < /backup/docflow-YYYYMMDD.dump
   ```
5. **검증**:
   ```bash
   DATABASE_URL=postgres://docflow:docflow@localhost:5432/docflow_restore go run ./scripts/verify-stats
   DATABASE_URL=postgres://docflow:docflow@localhost:5432/docflow_restore go run ./scripts/verify-calendar
   ```
6. **DB 전환**: `docflow` → `docflow_old_YYYYMMDD`, `docflow_restore` → `docflow`. 두 RENAME 을 single tx 로:
   ```sql
   BEGIN;
   ALTER DATABASE docflow RENAME TO docflow_old_YYYYMMDD;
   ALTER DATABASE docflow_restore RENAME TO docflow;
   COMMIT;
   ```
7. **마지막 정상 import 시점 이후 incremental 재적용** (사고 시점 ~ 백업 시각 사이 작업):
   - audit_log 테이블 조회 → 사고 후 정상 작업 식별.
   - 필요 시 hand-replay (보통 1~2시간 분 → manual recover 가능 규모).
8. **API 재기동**: `docker compose start api`.
9. **직원 공지**: 복구 완료 + 사고 후 작업 재입력 가이드 (필요 시).

---

## 시나리오 3 — cutover 직후 권한 누수 발견

증상: 일반 직원이 다른 직원의 휴가 사유 / 출퇴근 기록을 볼 수 있다는 신고.

### 절차

1. **즉시 해당 endpoint 비활성**:
   - 단기: env flag 추가 (`FEATURE_X_ENABLED=false`) → `docker compose restart api`.
   - 또는: Caddy 에서 해당 path 를 503 으로 reverse_proxy.
2. **영향 범위 파악**:
   - audit_log 조회: 누가/언제/몇 번 접근했는지.
   - 휴가 사유 마스킹 누락: `SELECT count(*) FROM audit_log WHERE action='calendar.list' AND created_at > '사고시각'`.
3. **패치 + PR**:
   - 권한 매트릭스 회귀 테스트 추가 (`permission_matrix_test.go`).
   - 패치 commit → PR → CI green 확인 → 머지.
4. **재배포**: `docker compose -f infra/docker-compose.prod.yml up -d --build api`.
5. **smoke 회귀**: `verify-stats`, `verify-calendar`, 권한 매트릭스 테스트 통과.
6. **사후 처리**:
   - 영향 받은 사용자 list (audit_log) → HR/법무 통보.
   - 사내 공지: 사고 사실 + 조치 + 재발 방지 안내.
   - 사고 보고서: `docs/03-review/incident-YYYYMMDD.md`.

---

## 정기 훈련

| 주기 | 항목                                     | 책임자     |
|------|-----------------------------------------|-----------|
| 매주 | 가장 최근 백업 dump header 자동 점검       | SRE (cron) |
| 분기 | 백업 복원 훈련 (시나리오 2)                | SRE + DBA  |
| 연 1회 | 전체 DR drill (시나리오 1+2 동시, 토요일 새벽) | 전 운영팀 |

### 분기 drill checklist

- [ ] 백업 dump 선택 (지난 분기 임의 일자)
- [ ] staging DB 에 복원 (`pg_restore`)
- [ ] `verify-stats` + `verify-calendar` 통과
- [ ] 복원 소요 시간 기록 (목표 ≤ 30분)
- [ ] 회고록 작성 + 본 runbook 업데이트

---

## 비상 연락

- 운영 on-call: <Slack #docflow-oncall>
- DBA: <연락처 사내 wiki>
- 법무 (개인정보 사고 시): <연락처 사내 wiki>
- 외부 SaaS 백업 운영 (P1 첫 1~2주만): <기존 SaaS 운영자>
