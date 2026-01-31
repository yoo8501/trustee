# REST API Rules

## 응답 형식
- 성공: `{ data: T }`
- 에러: `{ error: { code: string, message: string } }`
- 목록: `{ data: T[], total: number }`

## HTTP 상태 코드
- 200: 성공
- 201: 생성 성공
- 400: 잘못된 요청
- 401: 인증 필요
- 403: 권한 없음
- 404: 리소스 없음
- 500: 서버 에러

## Next.js API 라우트
- `app/api/` 디렉토리에 `route.ts` 파일 사용
- HTTP 메서드별 함수 export (GET, POST, PATCH, DELETE)
- NextRequest, NextResponse 사용
- try-catch로 에러 핸들링 필수
