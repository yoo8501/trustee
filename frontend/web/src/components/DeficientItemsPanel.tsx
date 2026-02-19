"use client";

import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import { Box, Paper } from "@trustee/ui";

interface DeficientItem {
  no: string;
  question: string;
  currentStatus?: string;
  remarks?: string;
  isCritical: boolean;
  categoryName: string;
}

interface DeficientItemsPanelProps {
  categories: {
    name: string;
    sections: {
      items: {
        no: string;
        question: string;
        applicable: boolean;
        answer?: string | null;
        currentStatus?: string | null;
        remarks?: string | null;
        isCritical: boolean;
      }[];
    }[];
  }[];
}

export function DeficientItemsPanel({ categories }: DeficientItemsPanelProps) {
  const deficientItems: DeficientItem[] = [];

  for (const cat of categories) {
    for (const sec of cat.sections) {
      for (const item of sec.items) {
        if (item.applicable && item.answer === "no") {
          deficientItems.push({
            no: item.no,
            question: item.question,
            currentStatus: item.currentStatus ?? undefined,
            remarks: item.remarks ?? undefined,
            isCritical: item.isCritical,
            categoryName: cat.name,
          });
        }
      }
    }
  }

  if (deficientItems.length === 0) return null;

  return (
    <Accordion defaultExpanded sx={{ mb: 3 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningAmberIcon sx={{ color: "#fc7840" }} />
          <Typography fontWeight={600}>미흡 항목</Typography>
          <Chip label={`${deficientItems.length}건`} size="small" color="warning" />
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {deficientItems.map((item) => (
          <Paper
            key={item.no}
            variant="outlined"
            sx={{
              p: 2,
              mb: 1,
              borderLeft: `3px solid ${item.isCritical ? "#eb5757" : "#fc7840"}`,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 0.5 }}>
              <Chip label={item.no} size="small" variant="outlined" />
              {item.isCritical && (
                <Chip label="필수" size="small" color="error" />
              )}
              <Typography variant="body2" fontWeight={500}>{item.question}</Typography>
            </Box>
            {item.currentStatus && (
              <Typography variant="caption" color="text.secondary">
                현황: {item.currentStatus}
              </Typography>
            )}
            {item.remarks && (
              <Typography variant="caption" color="text.secondary" display="block">
                비고: {item.remarks}
              </Typography>
            )}
          </Paper>
        ))}
      </AccordionDetails>
    </Accordion>
  );
}
