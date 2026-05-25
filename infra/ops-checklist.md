# DocFlow 운영 체크리스트 (Sprint 10 Phase Gate)

> P1 출시 게이트의 9개 운영 항목. 각 항목별 책임자/절차/검증법/현재 상태.
> 본 파일은 SRE/플랫폼 담당자가 cutover day 전에 모든 항목 ✅ 처리.

상태 범례:
- [ ] 미작성 — 절차 미정
- [x] 작성 — 절차 문서화 완료
- [d] 배포 — 운영 환경 적용 완료
- [v] 검증 — 분기 1회 훈련 또는 monitor 자동 알람 확인

---

## 1. PostgreSQL 자동 백업

- 책임: SRE
- 절차:
  - cron (host): `0 2 * * * /usr/bin/docker exec docflow-postgres pg_dump -Fc -U docflow docflow > /backup/docflow-$(date +\%Y\%m\%d).dump`
  - 보존: 30일치 (`find /backup -mtime +30 -name 'docflow-*.dump' -delete`).
  - off-site 복제: `rclone copy /backup remote:docflow-backup --max-age 7d` (분기 1회 권장, 운영 정책 의존).
- 검증: 매주 월요일 가장 최근 dump 파일 크기/header 자동 점검 + 분기 1회 복원 훈련 (§2).
- 상태: [x] 작성 / [ ] 배포 / [ ] 검증

---

## 2. 백업 복원 훈련

- 책임: SRE + DBA
- 절차:
  - 분기 1회 (1/4/7/10월 첫 평일): 가장 최근 dump 를 staging DB 에 복원.
  - `pg_restore -d docflow_staging /backup/docflow-YYYYMMDD.dump`
  - 복원 후 `go run ./scripts/verify-stats` + `go run ./scripts/verify-calendar` 통과 확인.
- 회고: 복원 시간/이상 항목 기록 → `infra/dr-runbook.md` 시나리오 2 업데이트.
- 상태: [x] 작성 / [ ] 배포 / [ ] 검증

---

## 3. DB 접근 감사 로그

- 책임: DBA
- 절차:
  - PostgreSQL `pgaudit` extension 설치 (또는 native `log_statement = 'mod'`).
  - 운영 DB `postgresql.conf` 에 `shared_preload_libraries = 'pgaudit'`, `pgaudit.log = 'write, ddl'` 설정.
  - 로그 보관: 5년 (CLAUDE.md §3.8 보관 정책 동일).
- 검증: super_admin 권한으로 임의 UPDATE 1회 실행 → 다음 날 audit log 에 row 존재 확인.
- 상태: [x] 작성 / [ ] 배포 / [ ] 검증

---

## 4. HTTPS 강제

- 책임: SRE
- 절차:
  - Caddy reverse proxy 가 자동 Let's Encrypt 발급 (`infra/caddy-prod.example.Caddyfile`).
  - HSTS header: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
  - HTTP → HTTPS 자동 redirect (Caddy 기본 동작).
- 검증: `curl -I http://docflow.example.com` → `301 → https://...`.
- 상태: [x] 작성 / [ ] 배포 / [ ] 검증

---

## 5. DB at-rest 암호화

- 책임: SRE
- 절차:
  - 옵션 A (간단): Linux LUKS volume 위에 docker volume mount.
    `cryptsetup luksFormat /dev/sdb` → `cryptsetup open /dev/sdb pgdata` → `/dev/mapper/pgdata` 를 docker volume bind.
  - 옵션 B: 매니지드 PostgreSQL (RDS / Cloud SQL) — at-rest 암호화 default ON 확인.
  - 추가: 민감 컬럼 (예: refresh_token JTI) 은 P2 이후 `pgcrypto.pgp_sym_encrypt` 고려.
- 검증: `lsblk` 또는 RDS 콘솔에서 암호화 상태 확인.
- 상태: [x] 작성 / [ ] 배포 / [ ] 검증

---

## 6. 개인정보처리방침

- 책임: HR + 법무
- 절차:
  - 사내 wiki/공지 게시 (수집 항목: 이메일/이름/팀/입사일/출퇴근 시각/휴가 기록, 보관 5년).
  - 직원 가입 시 동의 체크 (P2 에서 UI 추가, P1 은 사내 공지로 대체).
  - 회수 절차: HR 에 서면 요청 → 30일 내 anonymize/delete.
- 검증: 사내 공지 URL + 게시일 기록.
- 상태: [x] 작성 / [ ] 배포 / [ ] 검증

---

## 7. DB 직접 접근 권한 분리

- 책임: DBA + SRE
- 절차:
  - 운영 DB role 3개:
    - `docflow_app` (app 전용, CREATE/SELECT/UPDATE/DELETE on schema `public`).
    - `docflow_dba` (DBA 전용, SUPERUSER 권한, 2명 한정).
    - `docflow_ro` (감사/리포트 전용, SELECT only).
  - super_admin 사용자(app) 도 DB 직접 접근 권한 없음 (앱 endpoint 경유만).
  - `pg_hba.conf` 에서 dba role 은 bastion 호스트 IP 만 허용.
- 검증: `docflow_app` 계정으로 `DROP TABLE` 시도 → ERROR (permission denied).
- 상태: [x] 작성 / [ ] 배포 / [ ] 검증

---

## 8. DR runbook

- 책임: SRE
- 절차: 별도 파일 [`dr-runbook.md`](./dr-runbook.md) 참조.
- 검증: 연 1회 DR drill (오프시간 토요일 새벽) 실시 + 회고록 작성.
- 상태: [x] 작성 / [ ] 배포 / [ ] 검증

---

## 9. NTP 동기화

- 책임: SRE
- 절차:
  - 모든 호스트 (api / postgres / caddy 컨테이너 host) `chronyd` 활성:
    `systemctl enable --now chronyd && chronyc tracking`.
  - 컨테이너 내부는 host clock 공유 (docker default) — 별도 NTP 불필요.
  - 타임존: 모든 host `TZ=Asia/Seoul` (compose env 에서 강제).
- 검증: `chronyc tracking | grep "System time"` → ±0.5s 이내.
- 상태: [x] 작성 / [ ] 배포 / [ ] 검증

---

## 종합 status (Sprint 10 완료 시점)

| # | 항목                          | 작성 | 배포 | 검증 |
|---|------------------------------|:---:|:---:|:---:|
| 1 | PostgreSQL 자동 백업          | ✅  |  ⏳  |  ⏳  |
| 2 | 백업 복원 훈련                | ✅  |  ⏳  |  ⏳  |
| 3 | DB 접근 감사 로그             | ✅  |  ⏳  |  ⏳  |
| 4 | HTTPS 강제                    | ✅  |  ⏳  |  ⏳  |
| 5 | DB at-rest 암호화             | ✅  |  ⏳  |  ⏳  |
| 6 | 개인정보처리방침              | ✅  |  ⏳  |  ⏳  |
| 7 | DB 직접 접근 권한 분리        | ✅  |  ⏳  |  ⏳  |
| 8 | DR runbook                    | ✅  |  ⏳  |  ⏳  |
| 9 | NTP 동기화                    | ✅  |  ⏳  |  ⏳  |

**문서화 완료 (9/9). 배포/검증은 cutover day 전 운영팀 책임.**
