# Error Contract

> 새 에러 추가/처리 변경 시 본 문서 우선. CLAUDE.md §3 절대 규칙 위반 검토 함께.

---

## 1. 표준 Error Code Enum

Backend는 모든 실패 응답의 `details.errorCode`에 다음 enum 중 하나를 포함한다.

| Error Code | HTTP | 의미 | Frontend 기본 처리 |
|------------|------|------|---------------------|
| `VALIDATION_FAILED` | 400 | 입력 검증 실패 (`fields[]` 동봉) | form field error |
| `INVALID_REQUEST` | 400 | 요청 형식 오류 | toast |
| `UNAUTHENTICATED` | 401 | 인증 누락/만료 | login flow |
| `FORBIDDEN` | 403 | 권한 없음 | feature boundary 또는 toast |
| `NOT_FOUND` | 404 | 리소스 없음 | not found 화면 |
| `CONFLICT` | 409 | 충돌 (중복, 동시성) | mutation hook 메시지 |
| `RATE_LIMITED` | 429 | rate limit 초과 | toast + backoff |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 | global toast |
| `EXTERNAL_SERVICE_ERROR` | 502 | 외부 시스템 오류 | 재시도 안내 toast |
| `APPROVAL_INVALID_STATE` | 409 | 결재 상태 전이 불가 (예: 완료된 결재 재승인) | mutation hook 메시지 |
| `LEAVE_BALANCE_INSUFFICIENT` | 409 | 연차 잔여 부족 | mutation hook 메시지 |
| `TOKEN_EXPIRED` | 401 | JWT access/refresh 만료 (UNAUTHENTICATED 보다 구체적 — refresh 시도 분기에 사용) | global interceptor → refresh 시도 |
| `INVALID_CREDENTIALS` | 400 | 로그인 자격 증명 불일치 (이메일/비밀번호) | 로그인 폼 inline 에러 |
| `EMAIL_DUPLICATE` | 400 | 회원가입 시 이미 존재하는 이메일 | form field error |
| `USER_TERMINATED` | 400 | 퇴사 처리된(`status=terminated`) 사용자 로그인 시도 | 로그인 폼 inline 에러 |
| `CANNOT_DEMOTE_SELF` | 400 | 본인 role 강등 시도 (super_admin 본인이 본인 role 을 낮추려 함) | toast / form error |
| `INVALID_ACCRUAL_POLICY` | 400 | 휴가 종류 적립 정책 JSON 스키마 검증 실패 (type 누락 / unknown type / 음수 / cap < base 등) | form field error |
| `CHECK_IN_REQUIRED` | 400 | 퇴근(/check-out) 시도 시 같은 날 출근 record 가 없음 (Sprint 4 출퇴근) | inline 안내 ("출근 체크 먼저 해주세요") |
| `CANNOT_TERMINATE_SELF` | 400 | super_admin 본인이 본인 계정을 퇴사 처리 시도 (`POST /api/users/terminate`) | toast / form error |

새 도메인 추가 시 기존 enum 재사용 우선. 신규 코드는 본 표 + Backend/Frontend 동시 반영.

---

## 2. 처리 소유 계층 (Frontend)

| Status / Code | 소유 계층 | 처리 |
|---------------|-----------|------|
| 400 + `VALIDATION_FAILED` | form / mutation hook | field error 매핑 |
| 400 (기타) | mutation hook | toast |
| 401 | global interceptor | login flow |
| 403 | global interceptor 또는 feature boundary | toast 또는 차단 |
| 404 | route / page | not found 화면 |
| 409 | mutation hook | 충돌 메시지 |
| 5xx | global interceptor 또는 mutation hook | 일반 오류 toast |

mutation hook이 status를 직접 처리하면 interceptor의 전역 처리는 skip.

---

## 3. 응답에 노출 금지

- stack trace, SQL, secret, raw exception message
- 사용자 PII, internal id (`message`에)
- 위 항목은 로그/Sentry로만 전송

---

## 4. i18n 매핑

```ts
function resolveErrorMessage(error: ApiError, t: TFunction): string {
  if (error.errorCode) {
    return t(`error.${error.errorCode}`, { defaultValue: error.message ?? '' });
  }
  return error.message ?? t('error.unknown');
}
```

`t(..., { defaultValue })`는 번역 fallback이며 허용된다. domain data fallback(`apiModel.x || 'default'`)과 혼동 금지 — CLAUDE.md §3.7 참조.

### Validation Error 매핑 (React Hook Form 예시)

```ts
const onError = (error: ApiError) => {
  if (error.errorCode === 'VALIDATION_FAILED' && error.fields) {
    error.fields.forEach(({ field, reason }) => {
      formApi.setError(field, { type: reason, message: t(`error.field.${field}.${reason}`) });
    });
    return;
  }
  showErrorToast(resolveErrorMessage(error, t));
};
```
