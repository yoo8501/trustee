"use client";

import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LinkIcon from "@mui/icons-material/Link";
import RefreshIcon from "@mui/icons-material/Refresh";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";
import { Button, Box } from "@trustee/ui";

export interface ChecklistInfoCardProps {
  tokenUrl: string;
  deadline: Date | string | null;
  isExpired: boolean;
  daysLeft: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  submittedAt?: Date | string | null;
  submissionCount: number;
  status: string;
  onCopyLink: () => void;
  onRegenerate: () => void;
  onDeadlineEdit: () => void;
  copied: boolean;
  isRegenerating: boolean;
}

export function ChecklistInfoCard({
  tokenUrl,
  deadline,
  isExpired,
  daysLeft,
  contactName,
  contactEmail,
  contactPhone,
  submittedAt,
  submissionCount,
  status,
  onCopyLink,
  onRegenerate,
  onDeadlineEdit,
  copied,
  isRegenerating,
}: ChecklistInfoCardProps) {
  return (
    <Paper variant="outlined" sx={{ mb: 3 }}>
      {/* 토큰 링크 */}
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="subtitle2">수탁사 작성 링크</Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            loading={isRegenerating}
            onClick={onRegenerate}
          >
            재발급
          </Button>
        </Box>
        <TextField
          fullWidth
          value={tokenUrl}
          size="small"
          slotProps={{
            input: {
              readOnly: true,
              startAdornment: (
                <InputAdornment position="start">
                  <LinkIcon color="primary" fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={onCopyLink} size="small" title="링크 복사">
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
          sx={{
            bgcolor: "action.hover",
            "& .MuiInputBase-input": { color: "text.primary" },
          }}
        />
        {copied && (
          <Typography variant="caption" color="success.main" sx={{ mt: 0.5, display: "block" }}>
            링크가 복사되었습니다!
          </Typography>
        )}
      </Box>

      {/* 기한 정보 */}
      {deadline != null && (
        <>
          <Divider />
          <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CalendarTodayIcon fontSize="small" color="action" />
              <Typography variant="subtitle2">작성 기한</Typography>
              <Typography variant="body2">
                {new Date(deadline).toLocaleDateString("ko-KR")}
              </Typography>
              <Chip
                label={isExpired ? "만료됨" : `D-${daysLeft}`}
                color={isExpired ? "error" : (daysLeft !== null && daysLeft <= 3) ? "warning" : "info"}
                size="small"
              />
            </Box>
            {!isExpired && status !== "reviewed" && (
              <Button variant="outlined" size="small" onClick={onDeadlineEdit}>
                기한 변경
              </Button>
            )}
          </Box>
        </>
      )}

      {/* 작성자 정보 */}
      {contactName && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <PersonIcon fontSize="small" color="action" />
                <Typography variant="body2">{contactName}</Typography>
              </Box>
              {contactEmail && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <EmailIcon fontSize="small" color="action" />
                  <Typography variant="body2">{contactEmail}</Typography>
                </Box>
              )}
              {contactPhone && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <PhoneIcon fontSize="small" color="action" />
                  <Typography variant="body2">{contactPhone}</Typography>
                </Box>
              )}
              {submittedAt && (
                <Typography variant="body2" color="text.secondary">
                  제출일: {new Date(submittedAt).toLocaleString("ko-KR")}
                </Typography>
              )}
              {submissionCount > 0 && (
                <Typography variant="body2" color="text.secondary">
                  제출 횟수: {submissionCount}회
                </Typography>
              )}
            </Box>
          </Box>
        </>
      )}
    </Paper>
  );
}
