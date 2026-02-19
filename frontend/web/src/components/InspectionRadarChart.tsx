"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { colors } from "@trustee/ui";

export interface RadarDataPoint {
  category: string;
  current: number;
  previous?: number;
}

export interface InspectionRadarChartProps {
  data: RadarDataPoint[];
  showPrevious?: boolean;
}

export function InspectionRadarChart({ data, showPrevious = false }: InspectionRadarChartProps) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 2, color: colors.fg.secondary }}>
        카테고리별 점수
      </Typography>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke={colors.border.secondary} />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: colors.fg.tertiary, fontSize: 12 }}
          />
          {showPrevious && (
            <Radar
              name="이전 점검"
              dataKey="previous"
              stroke={colors.fg.quaternary}
              fill={colors.fg.quaternary}
              fillOpacity={0.1}
              strokeDasharray="4 4"
            />
          )}
          <Radar
            name="이번 점검"
            dataKey="current"
            stroke="#5e6ad2"
            fill="#5e6ad2"
            fillOpacity={0.25}
          />
          <Legend
            wrapperStyle={{ color: colors.fg.tertiary, fontSize: 12 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </Paper>
  );
}
