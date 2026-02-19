"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LinkIcon from "@mui/icons-material/Link";
import RefreshIcon from "@mui/icons-material/Refresh";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";
import {
  PageHeader,
  Button,
  Box,
  CircularProgress,
  Dialog,
} from "@trustee/ui";
import { spacing } from "@trustee/ui";
import {
  useTrusteeChecklist,
  useUpdateTrusteeChecklist,
  useRegenerateToken,
} from "@/hooks";

const statusLabelMap: Record<string, string> = {
  draft: "초안",
  sent: "전달됨",
  in_progress: "작성중",
  submitted: "제출완료",
  reviewed: "검토완료",
};

const statusColorMap: Record<string, "default" | "info" | "warning" | "success" | "primary"> = {
  draft: "default",
  sent: "info",
  in_progress: "warning",
  submitted: "primary",
  reviewed: "success",
};

const answerLabelMap: Record<string, string> = {
  yes: "예",
  no: "아니오",
  not_applicable: "N/A",
};

export default function ChecklistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data, isLoading } = useTrusteeChecklist(id);
  const { mutate: updateChecklist, isPending: isReviewing } = useUpdateTrusteeChecklist();
  const { mutate: regenerateToken, isPending: isRegenerating } = useRegenerateToken();
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReviewOpen, setConfirmReviewOpen] = useState(false);
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  const [deadlineEditOpen, setDeadlineEditOpen] = useState(false);
  const [newDeadline, setNewDeadline] = useState("");

  const checklist = data?.data;

  const isDeadlineExpired = checklist?.accessTokenExpiresAt
    ? new Date() > new Date(checklist.accessTokenExpiresAt)
    : false;

  const daysLeft = checklist?.accessTokenExpiresAt
    ? Math.ceil(
        (new Date(checklist.accessTokenExpiresAt).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const tokenUrl = checklist?.accessToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/checklist/${checklist.accessToken}`
    : "";

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(tokenUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleReviewComplete = () => {
    updateChecklist(
      { id, data: { status: "reviewed" } },
      {
        onSuccess: () => {
          setSnackbar("검토가 완료되었습니다.");
          setConfirmReviewOpen(false);
        },
        onError: () => setSnackbar("검토 완료 처리에 실패했습니다."),
      }
    );
  };

  const handleDeadlineChange = () => {
    if (!newDeadline) return;
    updateChecklist(
      { id, data: { deadline: new Date(newDeadline + "T23:59:59").toISOString() } },
      {
        onSuccess: () => {
          setSnackbar("작성 기한이 변경되었습니다.");
          setDeadlineEditOpen(false);
        },
        onError: () => setSnackbar("기한 변경에 실패했습니다."),
      }
    );
  };

  const handleRegenerateToken = () => {
    regenerateToken(id, {
      onSuccess: () => {
        setSnackbar("토큰이 재발급되었습니다.");
        setConfirmRegenerateOpen(false);
      },
      onError: () => setSnackbar("토큰 재발급에 실패했습니다."),
    });
  };

  if (isLoading) {
    return (
      <Box sx={{ p: `${spacing.pageInset}px`, display: "flex", justifyContent: "center", pt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!checklist) {
    return (
      <Box sx={{ p: `${spacing.pageInset}px` }}>
        <Typography>체크리스트를 찾을 수 없습니다.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: `${spacing.pageInset}px` }}>
      <PageHeader
        title={checklist.title}
        description={checklist.inspectionScope || ""}
        actions={
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Chip
              label={statusLabelMap[checklist.status] || checklist.status}
              color={statusColorMap[checklist.status] || "default"}
            />
            <Button variant="outlined" onClick={() => router.push("/inspections/checklists")}>
              목록
            </Button>
            {checklist.status === "submitted" && isDeadlineExpired && (
              <Button
                variant="contained"
                color="success"
                loading={isReviewing}
                onClick={() => setConfirmReviewOpen(true)}
              >
                검토 완료
              </Button>
            )}
            {checklist.status === "submitted" && !isDeadlineExpired && (
              <Chip label="기한 종료 후 검토 가능" color="info" variant="outlined" size="small" />
            )}
          </Box>
        }
      />

      {/* 토큰 링크 섹션 */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="subtitle2">
            수탁사 작성 링크
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            loading={isRegenerating}
            onClick={() => setConfirmRegenerateOpen(true)}
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
                  <IconButton onClick={handleCopyLink} size="small" title="링크 복사">
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
      </Paper>

      {/* 기한 정보 */}
      {checklist.accessTokenExpiresAt && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CalendarTodayIcon fontSize="small" color="action" />
              <Typography variant="subtitle2">작성 기한</Typography>
              <Typography variant="body2">
                {new Date(checklist.accessTokenExpiresAt).toLocaleDateString("ko-KR")}
              </Typography>
              <Chip
                label={isDeadlineExpired ? "만료됨" : `D-${daysLeft}`}
                color={isDeadlineExpired ? "error" : (daysLeft !== null && daysLeft <= 3) ? "warning" : "info"}
                size="small"
              />
            </Box>
            {!isDeadlineExpired && checklist.status !== "reviewed" && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setNewDeadline(new Date(checklist.accessTokenExpiresAt).toISOString().split("T")[0]);
                  setDeadlineEditOpen(true);
                }}
              >
                기한 변경
              </Button>
            )}
          </Box>
        </Paper>
      )}

      {/* 작성자 정보 (제출 이후) */}
      {checklist.contactName && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            작성자 정보
          </Typography>
          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <PersonIcon fontSize="small" color="action" />
              <Typography variant="body2">{checklist.contactName}</Typography>
            </Box>
            {checklist.contactEmail && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <EmailIcon fontSize="small" color="action" />
                <Typography variant="body2">{checklist.contactEmail}</Typography>
              </Box>
            )}
            {checklist.contactPhone && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <PhoneIcon fontSize="small" color="action" />
                <Typography variant="body2">{checklist.contactPhone}</Typography>
              </Box>
            )}
            {checklist.submittedAt && (
              <Typography variant="body2" color="text.secondary">
                제출일: {new Date(checklist.submittedAt).toLocaleString("ko-KR")}
              </Typography>
            )}
            {checklist.submissionCount > 0 && (
              <Typography variant="body2" color="text.secondary">
                제출 횟수: {checklist.submissionCount}회
              </Typography>
            )}
          </Box>
        </Paper>
      )}

      {/* 체크리스트 항목 (읽기 전용) */}
      {checklist.categories.map((category) => {
        const totalItems = category.sections.reduce((sum, sec) => sum + sec.items.length, 0);
        return (
          <Accordion key={category.id} defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Chip label={`${category.no}`} size="small" color="primary" />
                <Typography fontWeight={600}>{category.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  ({totalItems}개 항목)
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {category.sections.map((section) => (
                <Accordion key={section.id} defaultExpanded={false} variant="outlined" sx={{ mb: 1 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Chip label={section.no} size="small" variant="outlined" />
                      <Typography>{section.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        ({section.items.length}개)
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ width: 70 }}>No</TableCell>
                            <TableCell sx={{ minWidth: 200 }}>통제 항목</TableCell>
                            <TableCell sx={{ width: 60 }} align="center">대상</TableCell>
                            <TableCell sx={{ width: 100 }}>답변</TableCell>
                            <TableCell sx={{ minWidth: 150 }}>현황</TableCell>
                            <TableCell sx={{ minWidth: 150 }}>증빙 자료</TableCell>
                            <TableCell sx={{ minWidth: 120 }}>비고</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {section.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>{item.no}</TableCell>
                              <TableCell>
                                <Typography variant="body2">{item.question}</Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Chip
                                  label={item.applicable ? "Y" : "N"}
                                  size="small"
                                  color={item.applicable ? "primary" : "default"}
                                  variant="outlined"
                                />
                              </TableCell>
                              <TableCell>
                                {item.answer ? (
                                  <Chip
                                    label={answerLabelMap[item.answer] || item.answer}
                                    size="small"
                                    color={
                                      item.answer === "yes"
                                        ? "success"
                                        : item.answer === "no"
                                          ? "error"
                                          : "default"
                                    }
                                  />
                                ) : (
                                  <Typography variant="body2" color="text.disabled">
                                    -
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">
                                  {(item.currentStatus as string) || "-"}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                {item.evidenceFiles && item.evidenceFiles.length > 0
                                  ? item.evidenceFiles.map((f) => (
                                      <Typography key={f.id} variant="body2">
                                        {f.fileName}
                                      </Typography>
                                    ))
                                  : <Typography variant="body2">-</Typography>
                                }
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">
                                  {(item.remarks as string) || "-"}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              ))}
            </AccordionDetails>
          </Accordion>
        );
      })}

      {/* 검토 완료 확인 다이얼로그 */}
      <Dialog
        open={confirmReviewOpen}
        onClose={() => setConfirmReviewOpen(false)}
        title="검토 완료"
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setConfirmReviewOpen(false)}>취소</Button>
            <Button
              variant="contained"
              color="success"
              loading={isReviewing}
              onClick={handleReviewComplete}
            >
              완료
            </Button>
          </>
        }
      >
        <Typography>이 체크리스트를 검토 완료로 처리하시겠습니까?</Typography>
      </Dialog>

      {/* 토큰 재발급 확인 다이얼로그 */}
      <Dialog
        open={confirmRegenerateOpen}
        onClose={() => setConfirmRegenerateOpen(false)}
        title="토큰 재발급"
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setConfirmRegenerateOpen(false)}>취소</Button>
            <Button
              variant="contained"
              color="warning"
              loading={isRegenerating}
              onClick={handleRegenerateToken}
            >
              재발급
            </Button>
          </>
        }
      >
        <Typography>
          토큰을 재발급하면 기존 링크는 더 이상 사용할 수 없습니다. 계속하시겠습니까?
        </Typography>
      </Dialog>

      {/* 기한 변경 다이얼로그 */}
      <Dialog
        open={deadlineEditOpen}
        onClose={() => setDeadlineEditOpen(false)}
        title="작성 기한 변경"
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setDeadlineEditOpen(false)}>취소</Button>
            <Button variant="contained" onClick={handleDeadlineChange}>변경</Button>
          </>
        }
      >
        <TextField
          type="date"
          fullWidth
          label="새 기한"
          value={newDeadline}
          onChange={(e) => setNewDeadline(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setSnackbar(null)} severity="info" sx={{ width: "100%" }}>
          {snackbar}
        </Alert>
      </Snackbar>
    </Box>
  );
}
