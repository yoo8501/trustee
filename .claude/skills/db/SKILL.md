---
name: db
invocable: true
description: |
  Docker MySQL DB 조회 전용 스킬.
  테이블 데이터, 스키마, 직접 SQL 조회를 지원한다.
  Triggers: db 조회, DB 확인, 테이블 조회, 데이터 확인
allowed-tools:
  - Bash
---

# DB Query Skill - Docker MySQL 조회

## 사용법

```
/db                                    # 대화형: 어떤 DB/테이블을 조회할지 물어봄
/db users                              # auth_db.users 테이블 조회 (SELECT * LIMIT 20)
/db trustees                           # trustee_db.trustees 테이블 조회
/db inspections                        # inspection_db.inspections 테이블 조회
/db tables                             # 전체 DB의 테이블 목록 조회
/db schema users                       # users 테이블의 컬럼 정보(스키마) 조회
/db auth_db "SELECT * FROM users"      # 직접 SQL 실행 (SELECT만 허용)
```

## 접속 정보

- **Docker 컨테이너**: `trustee-mysql`
- **사용자**: `trustee`
- **비밀번호**: `trusteepassword`
- **데이터베이스**: `auth_db`, `trustee_db`, `inspection_db`

## 기본 실행 명령어

```bash
docker exec trustee-mysql mysql -u trustee -ptrusteepassword --default-character-set=utf8mb4 -e "SQL_HERE"
```

특정 DB 지정 시:

```bash
docker exec trustee-mysql mysql -u trustee -ptrusteepassword --default-character-set=utf8mb4 DB_NAME -e "SQL_HERE"
```

## 사전 조건

1. Docker 컨테이너가 실행 중이어야 한다
2. 먼저 `docker ps --filter name=trustee-mysql --format "{{.Status}}"` 로 확인
3. 실행 중이 아니면 사용자에게 `pnpm infra:up` 실행을 안내한다

## 안전 규칙 (필수)

### 허용되는 쿼리
- `SELECT` - 데이터 조회
- `SHOW` - 테이블/DB 목록, 컬럼 정보
- `DESCRIBE` / `DESC` - 테이블 스키마

### 차단되는 쿼리 (절대 실행 금지)
- `INSERT`, `UPDATE`, `DELETE` - 데이터 변경
- `DROP`, `ALTER`, `TRUNCATE` - 스키마 변경
- `CREATE` - 객체 생성
- `GRANT`, `REVOKE` - 권한 변경

**사용자가 변경 쿼리를 요청하면 거부하고, 읽기 전용 스킬임을 안내한다.**

### 결과 제한
- `SELECT` 쿼리에 `LIMIT`가 없으면 자동으로 `LIMIT 20` 추가
- 사용자가 명시적으로 LIMIT를 지정한 경우 해당 값 사용

## 테이블 → DB 자동 매핑

| 테이블명 | 데이터베이스 |
|----------|-------------|
| `users` | `auth_db` |
| `refresh_tokens` | `auth_db` |
| `trustees` | `trustee_db` |
| `contracts` | `trustee_db` |
| `inspections` | `inspection_db` |
| `inspection_items` | `inspection_db` |

매핑에 없는 테이블은 3개 DB를 순서대로 탐색하여 찾는다.

## 명령어별 동작

### `/db` (인자 없음)
AskUserQuestion으로 사용자에게 조회 대상을 물어본다:
- 옵션: "테이블 데이터 조회", "전체 테이블 목록", "테이블 스키마 조회", "직접 SQL 실행"

### `/db {테이블명}`
1. 테이블명으로 DB 자동 매핑
2. `SELECT * FROM {테이블명} LIMIT 20` 실행
3. 결과를 마크다운 테이블로 정리하여 출력

### `/db tables`
3개 DB 모두에 대해 테이블 목록 조회:
```sql
SHOW TABLES FROM auth_db;
SHOW TABLES FROM trustee_db;
SHOW TABLES FROM inspection_db;
```

### `/db schema {테이블명}`
1. 테이블명으로 DB 자동 매핑
2. `DESCRIBE {테이블명}` 실행
3. 컬럼명, 타입, Null 여부, Key, Default 값을 마크다운 테이블로 출력

### `/db {DB명} "{SQL}"`
1. SQL이 허용된 쿼리인지 검증 (SELECT/SHOW/DESCRIBE만)
2. SELECT에 LIMIT가 없으면 LIMIT 20 자동 추가
3. 해당 DB에서 SQL 실행
4. 결과 출력

## 출력 형식

결과는 보기 좋게 마크다운 테이블로 정리한다:

```
### auth_db.users (3건)

| id | email | name | created_at |
|----|-------|------|------------|
| clxxx... | admin@test.com | 관리자 | 2026-02-18 ... |
| clyyy... | user@test.com | 사용자 | 2026-02-18 ... |
```

데이터가 없으면:
```
### auth_db.users (0건)

데이터가 없습니다.
```

## 주의사항

- 비밀번호 등 민감 컬럼은 값을 마스킹하여 표시 (`password` → `***`)
- 긴 텍스트 값은 50자까지만 표시하고 `...` 추가
- 에러 발생 시 MySQL 에러 메시지를 그대로 전달하여 디버깅에 도움
- 이 스킬은 **읽기 전용**이다. 데이터 변경은 Prisma Studio나 직접 SQL 도구를 사용하도록 안내
