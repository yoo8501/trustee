import type { UIGrade } from "@trustee/ui";
import type { InspectionGrade } from "@trustee/types";

/**
 * 백엔드 등급(S/A/B/C/D) + 점수를 UI 표시용 등급으로 변환
 */
export function toUIGrade(grade: InspectionGrade, score: number): UIGrade {
  if (grade === "S" && score >= 95) return "A+";
  if (grade === "S") return "A";
  if (grade === "A") return "B+";
  if (grade === "B") return "B";
  if (grade === "C") return "C";
  return "D";
}

/**
 * 점수에서 직접 UI 등급 변환
 */
export function scoreToUIGrade(score: number): UIGrade {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B+";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}
