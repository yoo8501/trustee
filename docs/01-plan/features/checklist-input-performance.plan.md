# Plan: 체크리스트 제출 페이지 입력 성능 최적화

## 1. 개요

### 문제 정의
체크리스트 제출 페이지(`/checklist/[token]`)에서 TextField 입력 시 심각한 지연이 발생한다.
100개 이상의 체크리스트 항목이 있을 때, 한 항목의 입력이 전체 페이지 리렌더링을 유발하여 UX가 크게 저하된다.

### 대상 파일
- `frontend/web/src/app/checklist/[token]/page.tsx` (620줄, 단일 컴포넌트)

### 영향 범위
- 수탁사 담당자가 체크리스트를 작성하는 핵심 페이지
- 항목 수가 많을수록 지연이 심해짐 (100+ 항목 기준 체감 가능한 지연)

## 2. 원인 분석

### 문제 1: 단일 `changes` 상태 객체 (영향도: 최상)
```typescript
// Line 61
const [changes, setChanges] = useState<Record<string, ItemChange>>({});
```
- 어떤 항목이든 한 글자 입력 → `setChanges` 호출 → `changes` 객체 참조 변경
- `changes`를 의존하는 모든 UI가 리렌더링 (전체 카테고리/섹션/아이템)
- **100개 항목 × 5개 필드(Switch, RadioGroup, TextField×3) = 키스트로크당 500+ MUI 컴포넌트 리렌더링**

### 문제 2: 진행률 `useMemo`가 `changes`에 의존 (영향도: 중)
```typescript
// Line 175-198
const { totalItems, answeredItems, progress } = useMemo(() => {
  // 모든 카테고리 > 섹션 > 아이템 순회
  for (const cat of checklist.categories) {
    for (const sec of cat.sections) {
      for (const item of sec.items) { ... }
    }
  }
}, [checklist, changes]);  // ← changes 변경 시마다 재계산
```
- 매 키스트로크마다 전체 아이템 3중 루프 순회

### 문제 3: `React.memo` 미적용 (영향도: 최상)
```typescript
// Line 413-554 - 인라인 렌더링
{section.items.map((item) => {
  return (
    <TableRow key={item.id}>
      // ... Switch, RadioGroup, TextField ×3 ...
    </TableRow>
  );
})}
```
- 부모 상태(`changes`) 변경 시 **모든 행**이 무조건 리렌더링
- `React.memo`로 감싸면 props가 변경된 행만 리렌더링 가능

### 문제 4: `getItemValue` 렌더 본문 내 정의 (영향도: 중)
```typescript
// Line 238-240 - 매 렌더링마다 새로운 함수 참조
const getItemValue = (item, field) => {
  return changes[item.id]?.[field] ?? item[field];
};
```
- 메모이제이션된 자식에게 전달 시 항상 새 참조 → memo 무효화

### 문제 5: 인라인 `onChange` 핸들러 (영향도: 중)
```typescript
// 예: Line 498-504
onChange={(e) => updateItemField(item.id, "currentStatus", e.target.value)}
```
- 매 렌더링마다 새로운 arrow function 생성
- MUI `TextField`, `Switch`, `RadioGroup`가 불필요하게 리렌더링

## 3. 해결 방안

### Step 1: `ChecklistItemRow` 컴포넌트 분리 + `React.memo`
- 각 항목(TableRow)을 별도 컴포넌트로 분리
- `React.memo`로 래핑하여 해당 항목의 데이터가 변경될 때만 리렌더링
- Props: `item`, `itemChange` (`changes[item.id]`), `isReadOnly`, `onFieldChange`

### Step 2: `onFieldChange` 안정적 참조
- `updateItemField`를 useCallback으로 유지 (이미 됨)
- 각 행에 `item.id`가 바인딩된 콜백 대신, 행 컴포넌트 내부에서 `item.id`를 직접 사용

### Step 3: 진행률 계산 최적화
- `changes` 변경 시 전체 순회 대신, 변경된 항목만 추적
- 또는 진행률 계산을 debounce하여 타이핑 중에는 갱신하지 않음

### Step 4: 섹션 컴포넌트 분리
- `ChecklistSection` 컴포넌트 분리 + `React.memo`
- 해당 섹션에 속한 아이템 변경이 없으면 섹션 전체 스킵

## 4. 구현 순서

1. `ChecklistItemRow` 컴포넌트 추출 + `React.memo` 적용
2. `ChecklistSection` 컴포넌트 추출 + `React.memo` 적용
3. Props 전달 최적화 (`itemChange`를 개별 전달)
4. 진행률 계산 debounce 또는 분리
5. 동작 검증

## 5. 예상 효과

| 항목 | Before | After |
|------|--------|-------|
| 키스트로크당 리렌더링 | 전체 100+ 행 | 변경된 1개 행만 |
| MUI 컴포넌트 리렌더링 | 500+ | 5개 (해당 행) |
| 진행률 재계산 | 매 키스트로크 | debounce 또는 변경분만 |
| 체감 입력 지연 | 수백ms | 즉각 반응 |

## 6. 리스크
- 컴포넌트 분리 시 기존 동작 (자동저장, 제출 등) 영향 없는지 확인 필요
- `changes` 상태 구조는 유지하되, 전달 방식만 최적화
