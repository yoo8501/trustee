# 수탁사 점검 스코어링 모델 설계서

## 1. 개요

수탁사의 개인정보보호 수준을 객관적으로 평가하기 위한 점수 산정 및 등급 부여 체계를 정의한다.
기존 시스템의 `TrusteeChecklistItem.answer` 필드(`yes` / `no` / `not_applicable`)를 기반으로 점수를 산정한다.

---

## 2. 배점 체계

### 2.1 카테고리별 가중치

총점은 **100점** 만점으로 산정한다.

| No | 카테고리 | 가중치(%) | 배점 | 항목 수 | 항목당 기본 배점 |
|----|---------|-----------|------|---------|----------------|
| 1 | 개인정보 처리 현황 | 15 | 15점 | 12 | 1.25점 |
| 2 | 관리적 보안 조치 | 20 | 20점 | 14 | 1.43점 |
| 3 | 기술적 보안 조치 | 25 | 25점 | 18 | 1.39점 |
| 4 | 물리적 보안 조치 | 10 | 10점 | 8 | 1.25점 |
| 5 | 재위탁 관리 | 10 | 10점 | 6 | 1.67점 |
| 6 | 교육 및 훈련 | 10 | 10점 | 6 | 1.67점 |
| 7 | 침해사고 대응 | 10 | 10점 | 8 | 1.25점 |
| **합계** | | **100** | **100점** | **72** | |

### 2.2 항목별 점수 산정

각 항목의 응답에 따른 점수 부여:

| 응답 | 설명 | 점수 비율 |
|------|------|-----------|
| `yes` (이행) | 해당 항목을 이행하고 있음 | 100% |
| `no` (미이행) | 해당 항목을 이행하지 않음 | 0% |
| `not_applicable` (해당없음) | 업무 특성상 해당 항목이 적용되지 않음 | 배점 제외 |

### 2.3 점수 산정 공식

```
카테고리 점수 = (카테고리 가중치) * (이행 항목 수 / 적용 가능 항목 수)

총점 = sum(카테고리별 점수)
```

**`not_applicable` 처리 방식**:
- 해당없음 항목은 분모(적용 가능 항목 수)에서 제외
- 이를 통해 업종/규모별 차이로 인한 불공정한 감점을 방지

**예시**:
- 카테고리 3(기술적 보안 조치, 가중치 25%): 18개 항목 중 3개가 해당없음, 12개 이행
- 카테고리 점수 = 25 * (12 / 15) = 20점

---

## 3. 등급 체계

### 3.1 5단계 등급

| 등급 | 명칭 | 점수 범위 | 설명 |
|------|------|-----------|------|
| **S** | 우수 | 90점 이상 | 전반적으로 우수한 개인정보보호 수준 유지 |
| **A** | 양호 | 80~89점 | 대부분의 보호조치를 이행하고 있으며 소수 개선 필요 |
| **B** | 보통 | 70~79점 | 기본적인 보호조치는 갖추었으나 일부 영역 보완 필요 |
| **C** | 미흡 | 60~69점 | 다수의 보호조치가 미흡하여 개선 조치 필요 |
| **D** | 위험 | 60점 미만 | 개인정보 보호 수준이 심각하게 부족하여 즉시 개선 필요 |

### 3.2 등급별 후속 조치

| 등급 | 후속 조치 |
|------|----------|
| **S** | 차기 점검 주기 연장 가능 (12개월), 우수 수탁사 인정 |
| **A** | 정기 점검 주기 유지 (6~12개월), 경미한 개선 권고 |
| **B** | 3개월 내 미흡 항목 개선 계획 수립 및 이행 확인 |
| **C** | 1개월 내 개선 계획 수립, 3개월 내 재점검 실시 |
| **D** | 즉시 개선 조치 요구, 1개월 내 재점검, 위탁 계약 재검토 |

### 3.3 필수 이행 항목 (Critical Items)

아래 항목이 미이행(`no`)인 경우, 총점과 무관하게 **최고 등급을 B로 제한**한다:

| 항목 No | 항목 | 사유 |
|---------|------|------|
| 2.1.1 | 내부관리계획 수립 | 법정 의무 사항 (안전성 확보조치 기준 제4조) |
| 2.2.1 | 개인정보 보호책임자 지정 | 법정 의무 사항 (개인정보보호법 제31조) |
| 3.2.2 | 고유식별정보 암호화 | 법정 의무 사항 (안전성 확보조치 기준 제7조) |
| 3.2.3 | 전송구간 암호화 | 법정 의무 사항 (안전성 확보조치 기준 제7조) |
| 3.3.1 | 접속기록 보관 | 법정 의무 사항 (안전성 확보조치 기준 제8조) |
| 7.1.3 | 유출 시 위탁자 통지 절차 | 법정 의무 사항 (개인정보보호법 제34조) |

---

## 4. 카테고리별 상세 배점

### 4.1 카테고리 1: 개인정보 처리 현황 (15점)

| 섹션 | 항목 수 | 적용 가능 범위 | 비고 |
|------|---------|---------------|------|
| 1.1 위탁 업무 범위 관리 | 3 | 전체 | 위탁 기본 사항 |
| 1.2 개인정보 현황 파악 | 3 | 전체 | 현황 관리 |
| 1.3 개인정보 생명주기 관리 | 6 | 일부 해당없음 가능 | 백업, 이전 등 |

### 4.2 카테고리 2: 관리적 보안 조치 (20점)

| 섹션 | 항목 수 | 적용 가능 범위 | 비고 |
|------|---------|---------------|------|
| 2.1 내부관리계획 수립 | 3 | 전체 | **필수 이행 포함** |
| 2.2 개인정보 보호책임자 | 3 | 전체 | **필수 이행 포함** |
| 2.3 접근권한 관리 | 4 | 전체 | 시스템 운영 기반 |
| 2.4 위탁계약 이행 | 4 | 전체 | 계약 이행 확인 |

### 4.3 카테고리 3: 기술적 보안 조치 (25점)

| 섹션 | 항목 수 | 적용 가능 범위 | 비고 |
|------|---------|---------------|------|
| 3.1 접근통제 | 5 | 전체 | 네트워크 보안 |
| 3.2 암호화 | 4 | 일부 해당없음 가능 | **필수 이행 포함** |
| 3.3 접속기록 관리 | 4 | 전체 | **필수 이행 포함** |
| 3.4 악성프로그램 방지 | 3 | 전체 | 엔드포인트 보안 |
| 3.5 보안시스템 운영 | 2 | 규모별 차등 | DLP 등 선택적 |

### 4.4 카테고리 4: 물리적 보안 조치 (10점)

| 섹션 | 항목 수 | 적용 가능 범위 | 비고 |
|------|---------|---------------|------|
| 4.1 물리적 출입통제 | 3 | 전체 | 전산실 보안 |
| 4.2 장비 및 문서 보안 | 5 | 전체 | 매체/문서 관리 |

### 4.5 카테고리 5: 재위탁 관리 (10점)

| 섹션 | 항목 수 | 적용 가능 범위 | 비고 |
|------|---------|---------------|------|
| 5.1 재위탁 통제 | 3 | 재위탁 시에만 | 해당없음 가능 |
| 5.2 재수탁자 관리감독 | 3 | 재위탁 시에만 | 해당없음 가능 |

> 재위탁이 없는 경우 전체 카테고리가 해당없음 처리되며, 나머지 카테고리 가중치가 비례 조정됨

### 4.6 카테고리 6: 교육 및 훈련 (10점)

| 섹션 | 항목 수 | 적용 가능 범위 | 비고 |
|------|---------|---------------|------|
| 6.1 개인정보 보호 교육 | 3 | 전체 | 법정 의무 교육 |
| 6.2 교육 관리 | 3 | 전체 | 교육 이행 관리 |

### 4.7 카테고리 7: 침해사고 대응 (10점)

| 섹션 | 항목 수 | 적용 가능 범위 | 비고 |
|------|---------|---------------|------|
| 7.1 사고 대응 체계 | 4 | 전체 | **필수 이행 포함** |
| 7.2 예방 및 복구 | 4 | 전체 | 사전 대비 |

---

## 5. 점수 산정 알고리즘

### 5.1 의사코드

```
function calculateScore(checklist: TrusteeChecklist): ScoringResult {
  // 카테고리별 가중치
  const WEIGHTS = {
    1: 15, 2: 20, 3: 25, 4: 10, 5: 10, 6: 10, 7: 10
  };

  let totalScore = 0;
  let totalWeight = 0;
  const categoryScores = [];
  const criticalFailures = [];

  for (const category of checklist.categories) {
    const weight = WEIGHTS[category.no];
    let yesCount = 0;
    let applicableCount = 0;

    for (const section of category.sections) {
      for (const item of section.items) {
        if (item.answer === 'not_applicable' || !item.applicable) {
          continue; // 해당없음은 제외
        }
        applicableCount++;
        if (item.answer === 'yes') {
          yesCount++;
        }
        // 필수 이행 항목 체크
        if (isCriticalItem(item.no) && item.answer !== 'yes') {
          criticalFailures.push(item.no);
        }
      }
    }

    if (applicableCount === 0) {
      // 카테고리 전체 해당없음 -> 가중치 재분배
      continue;
    }

    const categoryScore = weight * (yesCount / applicableCount);
    categoryScores.push({
      categoryNo: category.no,
      name: category.name,
      score: categoryScore,
      maxScore: weight,
      yesCount,
      applicableCount,
      percentage: (yesCount / applicableCount) * 100
    });

    totalScore += categoryScore;
    totalWeight += weight;
  }

  // 가중치 재분배 (해당없음 카테고리 제외 후 비례 조정)
  if (totalWeight < 100) {
    const adjustmentFactor = 100 / totalWeight;
    totalScore *= adjustmentFactor;
    for (const cs of categoryScores) {
      cs.score *= adjustmentFactor;
      cs.maxScore *= adjustmentFactor;
    }
  }

  // 등급 산정
  let grade = calculateGrade(totalScore);

  // 필수 이행 항목 위반 시 등급 제한
  if (criticalFailures.length > 0 && (grade === 'S' || grade === 'A')) {
    grade = 'B';
  }

  return {
    totalScore: Math.round(totalScore * 10) / 10,
    grade,
    categoryScores,
    criticalFailures,
    recommendation: getRecommendation(grade)
  };
}

function calculateGrade(score: number): Grade {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

function isCriticalItem(itemNo: string): boolean {
  return ['2.1.1', '2.2.1', '3.2.2', '3.2.3', '3.3.1', '7.1.3'].includes(itemNo);
}
```

### 5.2 결과 데이터 구조

```typescript
interface ScoringResult {
  totalScore: number;          // 0~100
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  categoryScores: CategoryScore[];
  criticalFailures: string[];  // 미이행 필수 항목 번호 목록
  recommendation: string;      // 등급별 후속 조치 권고
}

interface CategoryScore {
  categoryNo: number;
  name: string;
  score: number;              // 실 득점
  maxScore: number;           // 만점 (가중치 조정 후)
  yesCount: number;           // 이행 항목 수
  applicableCount: number;    // 적용 가능 항목 수
  percentage: number;         // 이행률 (%)
}
```

---

## 6. 리포트 구성 요소

점검 완료 후 생성되는 리포트에 포함할 항목:

### 6.1 요약 정보
- 수탁사명, 점검 일자, 점검 범위
- 총점 및 등급
- 필수 이행 항목 미이행 경고

### 6.2 카테고리별 점수
- 카테고리별 득점/만점
- 카테고리별 이행률(%) 막대 그래프
- 레이더(방사형) 차트

### 6.3 미이행 항목 목록
- 카테고리별 미이행(`no`) 항목 리스트
- 각 항목의 개선 필요 사항
- 증빙 자료 첨부 현황

### 6.4 이전 점검 대비 변화
- 이전 점검 점수와의 비교
- 개선/악화 항목 표시
- 추이 그래프 (점검 이력이 있는 경우)

### 6.5 권고 사항
- 등급별 후속 조치 권고
- 우선 개선 항목 (필수 이행 미충족 > 가중치 높은 카테고리 미이행)
- 다음 점검 예정일

---

## 7. 기존 시스템 호환성

### 7.1 기존 Inspection 모델과의 관계
- `Inspection.score`: 스코어링 결과의 `totalScore`를 저장
- `Inspection.findings`: 미이행 항목 요약을 저장
- `Inspection.improvements`: 권고사항 요약을 저장
- `InspectionItem.category`: 카테고리명과 매핑
- `InspectionItem.result`: 체크리스트 answer와 매핑 (`yes`->pass, `no`->fail, `not_applicable`->not_applicable)

### 7.2 TrusteeChecklist와의 연계
- 수탁사가 체크리스트를 제출(`submitted`)하면 자동으로 점수 산정
- 점검 담당자가 검토(`reviewed`) 시 최종 점수 확정
- 확정된 점수를 기반으로 등급 부여 및 후속 조치 결정

### 7.3 구현 시 고려사항
- 스코어링 로직은 백엔드 서비스(inspection-service)에 구현
- 프론트엔드에서는 점수 및 등급 표시, 카테고리별 차트 렌더링
- 점수 재산정은 서버 사이드에서만 수행 (클라이언트 조작 방지)
