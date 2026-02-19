import type {
  ScoringResult,
  CategoryScore,
  AnswerDistribution,
  InspectionGrade,
} from "@trustee/types";
import {
  GRADE_THRESHOLDS,
  GRADE_RECOMMENDATIONS,
} from "@trustee/types";

// 체크리스트의 전체 트리 구조 (repository에서 include한 결과)
interface ChecklistWithItems {
  categories: {
    no: number;
    name: string;
    weight: number;
    sections: {
      items: {
        no: string;
        applicable: boolean;
        answer: "yes" | "no" | "not_applicable" | null;
        isCritical: boolean;
      }[];
    }[];
  }[];
}

export class ScoringService {
  calculate(checklist: ChecklistWithItems): ScoringResult {
    let totalScore = 0;
    let totalWeight = 0;
    const categoryScores: CategoryScore[] = [];
    const criticalFailures: string[] = [];
    const distribution: AnswerDistribution = { yes: 0, no: 0, na: 0, total: 0 };

    for (const category of checklist.categories) {
      const weight = category.weight;
      let yesCount = 0;
      let noCount = 0;
      let naCount = 0;
      let applicableCount = 0;
      let totalCount = 0;

      for (const section of category.sections) {
        for (const item of section.items) {
          totalCount++;
          distribution.total++;

          if (!item.applicable || item.answer === "not_applicable") {
            naCount++;
            distribution.na++;
            continue;
          }

          applicableCount++;

          if (item.answer === "yes") {
            yesCount++;
            distribution.yes++;
          } else {
            noCount++;
            distribution.no++;
          }

          // 필수 이행 항목 체크
          if (item.isCritical && item.answer !== "yes") {
            criticalFailures.push(item.no);
          }
        }
      }

      if (applicableCount === 0) {
        // 카테고리 전체 해당없음 -> 가중치 재분배 대상
        continue;
      }

      const categoryScore = weight * (yesCount / applicableCount);
      categoryScores.push({
        categoryNo: category.no,
        name: category.name,
        score: Math.round(categoryScore * 100) / 100,
        maxScore: weight,
        weight,
        yesCount,
        noCount,
        naCount,
        applicableCount,
        totalCount,
        percentage: Math.round((yesCount / applicableCount) * 10000) / 100,
      });

      totalScore += categoryScore;
      totalWeight += weight;
    }

    // 가중치 재분배 (해당없음 카테고리 제외 후 비례 조정)
    if (totalWeight > 0 && totalWeight < 100) {
      const adjustmentFactor = 100 / totalWeight;
      totalScore *= adjustmentFactor;
      for (const cs of categoryScores) {
        cs.score = Math.round(cs.score * adjustmentFactor * 100) / 100;
        cs.maxScore = Math.round(cs.maxScore * adjustmentFactor * 100) / 100;
      }
    }

    totalScore = Math.round(totalScore * 10) / 10;

    // 등급 산정
    let grade = this.calculateGrade(totalScore);

    // 필수 이행 항목 위반 시 등급 제한 (최고 B)
    if (criticalFailures.length > 0 && (grade === "S" || grade === "A")) {
      grade = "B";
    }

    return {
      totalScore,
      grade,
      categoryScores,
      criticalFailures,
      answerDistribution: distribution,
      recommendation: GRADE_RECOMMENDATIONS[grade],
    };
  }

  private calculateGrade(score: number): InspectionGrade {
    if (score >= GRADE_THRESHOLDS.S) return "S";
    if (score >= GRADE_THRESHOLDS.A) return "A";
    if (score >= GRADE_THRESHOLDS.B) return "B";
    if (score >= GRADE_THRESHOLDS.C) return "C";
    return "D";
  }
}
