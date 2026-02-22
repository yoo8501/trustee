"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useCallback, memo, useEffect } from "react";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import MuiDialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LinkIcon from "@mui/icons-material/Link";
import RefreshIcon from "@mui/icons-material/Refresh";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIcon from "@mui/icons-material/Phone";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DownloadIcon from "@mui/icons-material/Download";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import Checkbox from "@mui/material/Checkbox";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import {
  PageHeader,
  Button,
  Box,
  CircularProgress,
  Dialog,
} from "@trustee/ui";
import { spacing } from "@trustee/ui";
import type { EvidenceFile, RejectChecklistInput, ChecklistDiffItem } from "@trustee/types";
import { ScorePanel } from "@/components/ScorePanel";
import { InspectionRadarChart } from "@/components/InspectionRadarChart";
import { DeficientItemsPanel } from "@/components/DeficientItemsPanel";
import {
  useTrusteeChecklist,
  useUpdateTrusteeChecklist,
  useRegenerateToken,
  useRejectChecklist,
  useReviewChecklist,
  useChecklistSnapshots,
  useChecklistDiff,
  useChecklistReviews,
} from "@/hooks";
import { checklistResponseApi } from "@/lib/api";
import { useToast } from "@/hooks/useToast";

const statusLabelMap: Record<string, string> = {
  draft: "초안",
  sent: "전달됨",
  in_progress: "작성중",
  submitted: "제출완료",
  reviewed: "검토완료",
  rejected: "반려",
};

const statusColorMap: Record<string, "default" | "info" | "warning" | "success" | "primary" | "error"> = {
  draft: "default",
  sent: "info",
  in_progress: "warning",
  submitted: "primary",
  reviewed: "success",
  rejected: "error",
};

const answerLabelMap: Record<string, string> = {
  yes: "예",
  no: "아니오",
  not_applicable: "N/A",
};

function isPreviewable(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── 파일 미리보기 다이얼로그 ──
interface FilePreviewDialogProps {
  files: EvidenceFile[];
  currentIndex: number;
  open: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

function FilePreviewDialog({ files, currentIndex, open, onClose, onNavigate }: FilePreviewDialogProps) {
  const file = files[currentIndex];
  if (!file) return null;

  const fileUrl = checklistResponseApi.getFileUrl(file.storagePath);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < files.length - 1;

  return (
    <MuiDialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: "85vh", display: "flex", flexDirection: "column" } }}
    >
      {/* 헤더 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <InsertDriveFileIcon fontSize="small" color="action" />
          <Typography variant="subtitle2" noWrap>
            {file.fileName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({formatFileSize(file.fileSize)})
          </Typography>
          {files.length > 1 && (
            <Chip label={`${currentIndex + 1} / ${files.length}`} size="small" variant="outlined" />
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton
            size="small"
            component="a"
            href={fileUrl}
            download={file.fileName}
            title="다운로드"
          >
            <DownloadIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onClose} title="닫기">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* 미리보기 콘텐츠 */}
      <DialogContent
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 0,
          overflow: "hidden",
          position: "relative",
          bgcolor: "background.default",
        }}
      >
        {/* 이전/다음 네비게이션 */}
        {files.length > 1 && (
          <>
            <IconButton
              onClick={() => onNavigate(currentIndex - 1)}
              disabled={!hasPrev}
              sx={{
                position: "absolute",
                left: 8,
                zIndex: 1,
                bgcolor: "background.paper",
                boxShadow: 1,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <NavigateBeforeIcon />
            </IconButton>
            <IconButton
              onClick={() => onNavigate(currentIndex + 1)}
              disabled={!hasNext}
              sx={{
                position: "absolute",
                right: 8,
                zIndex: 1,
                bgcolor: "background.paper",
                boxShadow: 1,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <NavigateNextIcon />
            </IconButton>
          </>
        )}

        {file.mimeType.startsWith("image/") ? (
          <Box
            component="img"
            src={fileUrl}
            alt={file.fileName}
            sx={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
          />
        ) : file.mimeType === "application/pdf" ? (
          <Box
            component="iframe"
            src={fileUrl}
            title={file.fileName}
            sx={{ width: "100%", height: "100%", border: "none" }}
          />
        ) : (
          <Box sx={{ textAlign: "center", p: 4 }}>
            <InsertDriveFileIcon sx={{ fontSize: 64, color: "action.active", mb: 2 }} />
            <Typography variant="body1" gutterBottom>
              미리보기를 지원하지 않는 파일 형식입니다.
            </Typography>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={() => window.open(fileUrl, "_blank")}
            >
              다운로드
            </Button>
          </Box>
        )}
      </DialogContent>
    </MuiDialog>
  );
}

// ── 증빙파일 목록 + 미리보기 트리거 ──
function EvidenceFileList({ files }: { files: EvidenceFile[] }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const handlePreview = useCallback((index: number) => {
    setPreviewIndex(index);
    setPreviewOpen(true);
  }, []);

  if (!files || files.length === 0) {
    return <Typography variant="body2" color="text.disabled">-</Typography>;
  }

  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {files.map((file, index) => (
          <Box
            key={file.id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              p: 0.5,
              borderRadius: 1,
              bgcolor: "action.hover",
              cursor: "pointer",
              "&:hover": { bgcolor: "action.selected" },
            }}
            onClick={() => handlePreview(index)}
          >
            {file.mimeType.startsWith("image/") ? (
              <Box
                component="img"
                src={checklistResponseApi.getFileUrl(file.storagePath)}
                alt={file.fileName}
                sx={{
                  width: 28,
                  height: 28,
                  objectFit: "cover",
                  borderRadius: 0.5,
                  flexShrink: 0,
                }}
              />
            ) : (
              <InsertDriveFileIcon sx={{ fontSize: 16, color: "action.active", flexShrink: 0 }} />
            )}
            <Typography
              variant="caption"
              sx={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.fileName}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              {formatFileSize(file.fileSize)}
            </Typography>
            {isPreviewable(file.mimeType) && (
              <VisibilityIcon sx={{ fontSize: 14, color: "action.active", flexShrink: 0 }} />
            )}
          </Box>
        ))}
      </Box>
      <FilePreviewDialog
        files={files}
        currentIndex={previewIndex}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onNavigate={setPreviewIndex}
      />
    </>
  );
}

// ── 반려 다이얼로그 아이템 행 (memo) ──
const RejectItemRow = memo(function RejectItemRow({
  itemId,
  itemNo,
  itemQuestion,
  checked,
  reason,
  onCheckedChange,
  onReasonChange,
}: {
  itemId: string;
  itemNo: string;
  itemQuestion: string;
  checked: boolean;
  reason: string;
  onCheckedChange: (itemId: string, checked: boolean) => void;
  onReasonChange: (itemId: string, reason: string) => void;
}) {
  return (
    <Box sx={{ mb: 1 }}>
      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              checked={checked}
              onChange={(e) => onCheckedChange(itemId, e.target.checked)}
            />
          }
          label={
            <Typography variant="body2">
              <Chip label={itemNo} size="small" variant="outlined" sx={{ mr: 0.5 }} />
              {itemQuestion}
            </Typography>
          }
        />
      </FormGroup>
      {checked && (
        <TextField
          size="small"
          fullWidth
          multiline
          maxRows={3}
          placeholder="반려 사유를 입력하세요"
          value={reason}
          onChange={(e) => onReasonChange(itemId, e.target.value)}
          sx={{ ml: 4, mt: 0.5, width: "calc(100% - 32px)" }}
        />
      )}
    </Box>
  );
});

// ── 반려 다이얼로그 (독립 상태 관리) ──
interface RejectDialogProps {
  open: boolean;
  onClose: () => void;
  categories: { sections: { items: { id: string; no: string; question: string }[] }[] }[];
  isRejecting: boolean;
  onSubmit: (items: RejectChecklistInput["items"], newDeadline: string) => void;
  onError: (msg: string) => void;
}

function RejectDialogContent({ open, onClose, categories, isRejecting, onSubmit, onError }: RejectDialogProps) {
  const [rejectedItems, setRejectedItems] = useState<Record<string, boolean>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [rejectDeadline, setRejectDeadline] = useState("");

  useEffect(() => {
    if (open) {
      setRejectedItems({});
      setRejectReasons({});
      setRejectDeadline("");
    }
  }, [open]);

  const handleCheckedChange = useCallback((itemId: string, checked: boolean) => {
    setRejectedItems((prev) => ({ ...prev, [itemId]: checked }));
  }, []);

  const handleReasonChange = useCallback((itemId: string, reason: string) => {
    setRejectReasons((prev) => ({ ...prev, [itemId]: reason }));
  }, []);

  const handleSubmit = () => {
    if (!rejectDeadline) {
      onError("새 작성 기한을 선택해주세요.");
      return;
    }
    const hasRejected = Object.values(rejectedItems).some(Boolean);
    if (!hasRejected) {
      onError("반려할 항목을 최소 1개 이상 선택해주세요.");
      return;
    }

    const allItems: RejectChecklistInput["items"] = [];
    for (const cat of categories) {
      for (const sec of cat.sections) {
        for (const item of sec.items) {
          allItems.push({
            itemId: item.id,
            status: rejectedItems[item.id] ? "rejected" : "approved",
            reason: rejectedItems[item.id] ? rejectReasons[item.id] || undefined : undefined,
          });
        }
      }
    }

    onSubmit(allItems, new Date(rejectDeadline + "T23:59:59").toISOString());
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="체크리스트 반려"
      maxWidth="md"
      actions={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="contained"
            color="error"
            loading={isRejecting}
            onClick={handleSubmit}
          >
            반려 처리
          </Button>
        </>
      }
    >
      <Stack spacing={2}>
        <TextField
          type="date"
          fullWidth
          label="새 작성 기한"
          required
          value={rejectDeadline}
          onChange={(e) => setRejectDeadline(e.target.value)}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: new Date().toISOString().split("T")[0] },
          }}
          sx={{
            "& input::-webkit-calendar-picker-indicator": {
              filter: "invert(1)",
            },
          }}
        />
        <Typography variant="subtitle2">반려할 항목을 선택하세요</Typography>
        <Box sx={{ maxHeight: 400, overflow: "auto" }}>
          {categories.map((cat) =>
            cat.sections.map((sec) =>
              sec.items.map((item) => (
                <RejectItemRow
                  key={item.id}
                  itemId={item.id}
                  itemNo={item.no}
                  itemQuestion={item.question}
                  checked={!!rejectedItems[item.id]}
                  reason={rejectReasons[item.id] || ""}
                  onCheckedChange={handleCheckedChange}
                  onReasonChange={handleReasonChange}
                />
              ))
            )
          )}
        </Box>
      </Stack>
    </Dialog>
  );
}

export default function ChecklistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data, isLoading } = useTrusteeChecklist(id);
  const { mutate: updateChecklist } = useUpdateTrusteeChecklist();
  const { mutate: regenerateToken, isPending: isRegenerating } = useRegenerateToken();
  const { mutate: rejectChecklist, isPending: isRejecting } = useRejectChecklist();
  const { mutate: reviewChecklist, isPending: isReviewingMut } = useReviewChecklist();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [confirmReviewOpen, setConfirmReviewOpen] = useState(false);
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  const [deadlineEditOpen, setDeadlineEditOpen] = useState(false);
  const [newDeadline, setNewDeadline] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [selectedRound, setSelectedRound] = useState<number | undefined>(undefined);

  const checklist = data?.data;

  // Snapshots 목록 (버전 선택기용)
  const { data: snapshotsData } = useChecklistSnapshots(
    checklist && checklist.submissionCount >= 2 ? id : "",
  );
  const snapshots = snapshotsData?.data || [];

  // Diff & Reviews 데이터 (조건부 조회)
  const { data: diffData } = useChecklistDiff(
    showDiff && checklist && checklist.submissionCount >= 2 ? id : "",
    selectedRound,
  );
  const { data: reviewsData } = useChecklistReviews(
    checklist && checklist.reviewRound > 0 ? id : "",
  );
  const diffChanges = diffData?.data?.changes || [];
  const diffMap = new Map<string, ChecklistDiffItem>(
    diffChanges.map((c) => [c.itemId, c])
  );
  const reviews = reviewsData?.data || [];
  const reviewMap = new Map(reviews.map((r) => [r.itemId, r]));

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
    reviewChecklist(id, {
      onSuccess: () => {
        toast.success("검토가 완료되었습니다.");
        setConfirmReviewOpen(false);
      },
    });
  };

  const handleOpenRejectDialog = () => {
    setRejectDialogOpen(true);
  };

  const handleRejectSubmit = (items: RejectChecklistInput["items"], newDeadline: string) => {
    rejectChecklist(
      { id, data: { items, newDeadline } },
      {
        onSuccess: () => {
          toast.success("반려 처리가 완료되었습니다.");
          setRejectDialogOpen(false);
        },
      }
    );
  };

  const handleDeadlineChange = () => {
    if (!newDeadline) return;
    updateChecklist(
      { id, data: { deadline: new Date(newDeadline + "T23:59:59").toISOString() } },
      {
        onSuccess: () => {
          toast.success("작성 기한이 변경되었습니다.");
          setDeadlineEditOpen(false);
        },
      }
    );
  };

  const handleRegenerateToken = () => {
    regenerateToken(id, {
      onSuccess: () => {
        toast.success("토큰이 재발급되었습니다.");
        setConfirmRegenerateOpen(false);
      },
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
            {checklist.status === "submitted" && (
              <>
                <Button
                  variant="contained"
                  color="success"
                  loading={isReviewingMut}
                  onClick={() => setConfirmReviewOpen(true)}
                >
                  검토 완료
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={handleOpenRejectDialog}
                >
                  반려
                </Button>
              </>
            )}
            {(checklist.status === "rejected" || checklist.status === "submitted") && checklist.submissionCount >= 2 && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<CompareArrowsIcon />}
                  onClick={() => setShowDiff((prev) => !prev)}
                >
                  {showDiff ? "변경사항 숨기기" : "변경사항 보기"}
                </Button>
                {showDiff && snapshots.length >= 2 && (
                  <Select
                    size="small"
                    value={selectedRound ?? "latest"}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedRound(val === "latest" ? undefined : Number(val));
                    }}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="latest">최신 변경사항</MenuItem>
                    {snapshots
                      .filter((s) => s.round >= 2)
                      .sort((a, b) => b.round - a.round)
                      .map((s) => (
                        <MenuItem key={s.round} value={s.round}>
                          {s.round}차 제출 ({new Date(s.submittedAt).toLocaleDateString("ko-KR")})
                        </MenuItem>
                      ))}
                  </Select>
                )}
              </Box>
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
      {checklist.accessTokenExpiresAt != null && (
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

      {/* 스코어 패널 + 레이더 차트 (제출/검토 완료 상태에서만) */}
      {(checklist.status === "submitted" || checklist.status === "reviewed") &&
        checklist.totalScore != null && checklist.scoreDetail != null && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 3,
            mb: 3,
          }}
        >
          <ScorePanel
            score={checklist.totalScore}
            distribution={checklist.scoreDetail.answerDistribution}
          />
          <InspectionRadarChart
            data={checklist.scoreDetail.categoryScores.map((cs) => ({
              category: cs.name,
              current: cs.percentage,
            }))}
          />
        </Box>
      )}

      {/* 미흡 항목 패널 (제출/검토 완료 상태에서만) */}
      {(checklist.status === "submitted" || checklist.status === "reviewed") && (
        <DeficientItemsPanel categories={checklist.categories} />
      )}

      {/* 체크리스트 항목 (읽기 전용) */}
      {checklist.categories.map((category) => {
        const totalItems = category.sections.reduce((sum, sec) => sum + sec.items.length, 0);
        const yesCount = category.sections.reduce(
          (sum, sec) => sum + sec.items.filter((i) => i.answer === "yes").length, 0
        );
        const noCount = category.sections.reduce(
          (sum, sec) => sum + sec.items.filter((i) => i.answer === "no").length, 0
        );
        const hasAnswers = yesCount > 0 || noCount > 0;
        return (
          <Accordion key={category.id} defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Chip label={`${category.no}`} size="small" color="primary" />
                <Typography fontWeight={600}>{category.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  ({totalItems}개 항목)
                </Typography>
                {hasAnswers && (
                  <>
                    <Chip label={`적합: ${yesCount}`} size="small" sx={{ bgcolor: "#27a64420", color: "#27a644" }} />
                    <Chip label={`미흡: ${noCount}`} size="small" sx={{ bgcolor: "#fc784020", color: "#fc7840" }} />
                  </>
                )}
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
                    <Stack spacing={1.5}>
                      {section.items.map((item) => {
                        const itemDiff = showDiff ? diffMap.get(item.id) : undefined;
                        const itemReview = reviewMap.get(item.id);
                        return (
                        <Paper
                          key={item.id}
                          variant="outlined"
                          sx={{
                            p: 2,
                            ...(itemReview?.status === "rejected" && {
                              borderColor: "error.main",
                              borderWidth: 2,
                            }),
                            ...(itemDiff && showDiff && {
                              bgcolor: "#4ea7fc0a",
                              borderColor: "#4ea7fc33",
                            }),
                          }}
                        >
                          {/* 반려 사유 표시 */}
                          {itemReview?.status === "rejected" && itemReview.reason && (
                            <Alert severity="error" sx={{ mb: 1.5 }}>
                              반려 사유: {itemReview.reason}
                            </Alert>
                          )}
                          {/* 헤더: 번호 + 질문 + 대상여부 + 답변 */}
                          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, mb: 1.5 }}>
                            <Box sx={{ flex: 1 }}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                                <Chip label={item.no} size="small" variant="outlined" />
                                <Typography variant="body2" fontWeight={600}>{item.question}</Typography>
                              </Box>
                            </Box>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                              <Chip
                                label={item.applicable ? "대상" : "비대상"}
                                size="small"
                                color={item.applicable ? "primary" : "default"}
                                variant="outlined"
                              />
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
                                <Chip label="미답변" size="small" variant="outlined" color="warning" />
                              )}
                            </Box>
                          </Box>

                          <Divider sx={{ mb: 1.5 }} />

                          <Stack spacing={1.5}>
                            {/* 이행 현황 */}
                            <Box>
                              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
                                이행 현황
                              </Typography>
                              <Typography variant="body2">
                                {(item.currentStatus as string) || "-"}
                              </Typography>
                            </Box>

                            {/* 증빙 자료 */}
                            <Box>
                              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
                                증빙 자료
                              </Typography>
                              <EvidenceFileList files={item.evidenceFiles || []} />
                            </Box>

                            {/* 비고 */}
                            {(item.remarks as string) && (
                              <Box>
                                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
                                  비고
                                </Typography>
                                <Typography variant="body2">
                                  {item.remarks as string}
                                </Typography>
                              </Box>
                            )}

                            {/* Diff 표시 */}
                            {itemDiff && showDiff && (
                              <Box sx={{ mt: 1, p: 1.5, bgcolor: "#232326", borderRadius: 1, border: 1, borderColor: "#34343a" }}>
                                <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: "block", color: "#4ea7fc" }}>
                                  변경사항 (제출 {diffData?.data?.previousRound}차 → {diffData?.data?.currentRound}차)
                                </Typography>
                                {itemDiff.fields.filter((f) => f.changed).map((f) => (
                                  <Typography key={f.field} variant="caption" sx={{ display: "block", color: "#d0d6e0" }}>
                                    <strong>
                                      {f.field === "answer" ? "답변" : f.field === "currentStatus" ? "이행 현황" : f.field === "remarks" ? "비고" : f.field === "evidenceFiles" ? "증빙 자료" : "대상 여부"}:
                                    </strong>{" "}
                                    <Box component="span" sx={{ textDecoration: "line-through", color: "#62666d" }}>
                                      {f.previous || "(미입력)"}
                                    </Box>
                                    {" → "}
                                    <Box component="span" sx={{ color: "#27a644", fontWeight: 600 }}>
                                      {f.current || "(미입력)"}
                                    </Box>
                                  </Typography>
                                ))}
                              </Box>
                            )}
                          </Stack>
                        </Paper>
                        );
                      })}
                    </Stack>
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
              loading={isReviewingMut}
              onClick={handleReviewComplete}
            >
              완료
            </Button>
          </>
        }
      >
        <Typography>이 체크리스트를 검토 완료로 처리하시겠습니까?</Typography>
      </Dialog>

      {/* 반려 다이얼로그 */}
      <RejectDialogContent
        open={rejectDialogOpen}
        onClose={() => setRejectDialogOpen(false)}
        categories={checklist.categories}
        isRejecting={isRejecting}
        onSubmit={handleRejectSubmit}
        onError={(msg) => toast.warning(msg)}
      />

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
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: new Date().toISOString().split("T")[0] },
          }}
          sx={{
            "& input::-webkit-calendar-picker-indicator": {
              filter: "invert(1)",
            },
          }}
        />
      </Dialog>

    </Box>
  );
}
