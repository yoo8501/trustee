"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import { GradeBadge } from "@trustee/ui";
import { colors } from "@trustee/ui";
import { scoreToUIGrade } from "@/lib/inspection-utils";

export interface AnswerDistribution {
  yes: number;
  no: number;
  na: number;
  total: number;
}

export interface ScorePanelProps {
  score: number;
  distribution: AnswerDistribution;
}

export function ScorePanel({ score, distribution }: ScorePanelProps) {
  const grade = scoreToUIGrade(score);
  const yesPercent = Math.round((distribution.yes / distribution.total) * 100);
  const noPercent = Math.round((distribution.no / distribution.total) * 100);
  const naPercent = Math.max(0, Math.round((distribution.na / distribution.total) * 100));

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      {/* 점수 및 등급 */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        <Typography variant="h3" sx={{ fontWeight: 700, color: colors.fg.primary }}>
          {score}점
        </Typography>
        <GradeBadge grade={grade} size="lg" />
      </Box>

      {/* 답변 분포 */}
      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: "#27a644" }}>
            적합 {yesPercent}% ({distribution.yes}건)
          </Typography>
          <Typography variant="caption" sx={{ color: "#fc7840" }}>
            미흡 {noPercent}% ({distribution.no}건)
          </Typography>
          <Typography variant="caption" sx={{ color: colors.fg.tertiary }}>
            N/A {naPercent}% ({distribution.na}건)
          </Typography>
        </Box>
        {/* 스택형 프로그레스 바 */}
        <Box sx={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: "2px" }}>
          <Box sx={{ width: `${yesPercent}%`, bgcolor: "#27a644", borderRadius: "4px 0 0 4px" }} />
          <Box sx={{ width: `${noPercent}%`, bgcolor: "#fc7840" }} />
          <Box sx={{ flex: 1, bgcolor: colors.border.secondary, borderRadius: "0 4px 4px 0" }} />
        </Box>
      </Box>

      <Typography variant="caption" sx={{ color: colors.fg.tertiary }}>
        전체 {distribution.total}개 항목
      </Typography>
    </Paper>
  );
}
