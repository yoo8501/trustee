// 스코어링 결과
export interface ScoringResult {
  totalScore: number;
  grade: InspectionGrade;
  categoryScores: CategoryScore[];
  criticalFailures: string[];
  answerDistribution: AnswerDistribution;
  recommendation: string;
}

export type InspectionGrade = "S" | "A" | "B" | "C" | "D";

export interface CategoryScore {
  categoryNo: number;
  name: string;
  score: number;
  maxScore: number;
  weight: number;
  yesCount: number;
  noCount: number;
  naCount: number;
  applicableCount: number;
  totalCount: number;
  percentage: number;
}

export interface AnswerDistribution {
  yes: number;
  no: number;
  na: number;
  total: number;
}

// 필수 이행 항목 번호 (상수)
export const CRITICAL_ITEMS = ["2.1.1", "2.2.1", "3.2.2", "3.2.3", "3.3.1", "7.1.3"] as const;

// 카테고리별 기본 가중치 (%)
export const DEFAULT_CATEGORY_WEIGHTS: Record<number, number> = {
  1: 15,
  2: 20,
  3: 25,
  4: 10,
  5: 10,
  6: 10,
  7: 10,
};

// 등급 산정 기준
export const GRADE_THRESHOLDS = {
  S: 90,
  A: 80,
  B: 70,
  C: 60,
} as const;

// 등급별 후속 조치 권고
export const GRADE_RECOMMENDATIONS: Record<InspectionGrade, string> = {
  S: "차기 점검 주기 연장 가능 (12개월), 우수 수탁사 인정",
  A: "정기 점검 주기 유지 (6~12개월), 경미한 개선 권고",
  B: "3개월 내 미흡 항목 개선 계획 수립 및 이행 확인",
  C: "1개월 내 개선 계획 수립, 3개월 내 재점검 실시",
  D: "즉시 개선 조치 요구, 1개월 내 재점검, 위탁 계약 재검토",
};
