"use client";

import { useParams } from "next/navigation";
import { useState, useCallback, useRef, useMemo, memo } from "react";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Switch from "@mui/material/Switch";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import LinearProgress from "@mui/material/LinearProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import VisibilityIcon from "@mui/icons-material/Visibility";
import CloseIcon from "@mui/icons-material/Close";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { Button, CircularProgress } from "@trustee/ui";
import type {
  TrusteeChecklistItem,
  TrusteeChecklistSection,
  EvidenceFile,
  ChecklistAnswer,
  BatchUpdateChecklistItemsInput,
} from "@trustee/types";
import {
  useChecklistByToken,
  useBatchSaveResponse,
  useUploadEvidence,
  useDeleteEvidence,
  useSubmitChecklist,
  useReopenChecklist,
  useChecklistResponseReviews,
} from "@/hooks";
import { checklistResponseApi } from "@/lib/api";
import { useToast } from "@/hooks/useToast";

interface ItemChange {
  applicable?: boolean;
  answer?: ChecklistAnswer | null;
  currentStatus?: string;
  remarks?: string;
}

// ── 증빙자료 파일 업로드 컴포넌트 ──
interface EvidenceFileUploadProps {
  itemId: string;
  files: EvidenceFile[];
  isReadOnly: boolean;
  token: string;
}

const MAX_FILES = 5;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isPreviewable(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

// ── 파일 미리보기 다이얼로그 ──
function FilePreviewDialog({
  files,
  currentIndex,
  open,
  onClose,
  onNavigate,
}: {
  files: EvidenceFile[];
  currentIndex: number;
  open: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const file = files[currentIndex];
  if (!file) return null;

  const fileUrl = checklistResponseApi.getFileUrl(file.storagePath);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < files.length - 1;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: "85vh", display: "flex", flexDirection: "column" } }}
    >
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
          <Typography variant="subtitle2" noWrap>{file.fileName}</Typography>
          <Typography variant="caption" color="text.secondary">
            ({formatFileSize(file.fileSize)})
          </Typography>
          {files.length > 1 && (
            <Chip label={`${currentIndex + 1} / ${files.length}`} size="small" variant="outlined" />
          )}
        </Box>
        <IconButton size="small" onClick={onClose} title="닫기">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

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
            sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
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
            <Typography variant="body1">
              미리보기를 지원하지 않는 파일 형식입니다.
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

const EvidenceFileUpload = memo(function EvidenceFileUpload({
  itemId,
  files,
  isReadOnly,
  token,
}: EvidenceFileUploadProps) {
  const { mutate: uploadFiles, isPending: isUploading } = useUploadEvidence(token);
  const { mutate: deleteFile, isPending: isDeleting } = useDeleteEvidence(token);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    const remaining = MAX_FILES - files.length;
    const filesToUpload = Array.from(selected).slice(0, remaining);

    if (filesToUpload.length > 0) {
      uploadFiles({ itemId, files: filesToUpload });
    }

    e.target.value = "";
  };

  const handleDelete = (fileId: string) => {
    deleteFile(fileId);
  };

  const handlePreview = (index: number) => {
    setPreviewIndex(index);
    setPreviewOpen(true);
  };

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
            }}
          >
            {file.mimeType.startsWith("image/") ? (
              <Box
                component="img"
                src={checklistResponseApi.getFileUrl(file.storagePath)}
                alt={file.fileName}
                sx={{
                  width: 24,
                  height: 24,
                  objectFit: "cover",
                  borderRadius: 0.5,
                  flexShrink: 0,
                  cursor: "pointer",
                }}
                onClick={() => handlePreview(index)}
              />
            ) : (
              <InsertDriveFileIcon sx={{ fontSize: 16, color: "action.active" }} />
            )}
            <Typography
              variant="caption"
              sx={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                cursor: isPreviewable(file.mimeType) ? "pointer" : "default",
                "&:hover": isPreviewable(file.mimeType) ? { textDecoration: "underline" } : {},
              }}
              onClick={() => isPreviewable(file.mimeType) && handlePreview(index)}
            >
              {file.fileName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatFileSize(file.fileSize)}
            </Typography>
            {isPreviewable(file.mimeType) && (
              <IconButton size="small" onClick={() => handlePreview(index)} sx={{ p: 0.25 }}>
                <VisibilityIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
            {!isReadOnly && (
              <IconButton
                size="small"
                onClick={() => handleDelete(file.id)}
                disabled={isDeleting}
                sx={{ p: 0.25 }}
              >
                <DeleteIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
          </Box>
        ))}
        {!isReadOnly && files.length < MAX_FILES && (
          <Button
            variant="text"
            size="small"
            component="label"
            startIcon={isUploading ? <CircularProgress size={14} /> : <AttachFileIcon sx={{ fontSize: 14 }} />}
            disabled={isUploading}
            sx={{ justifyContent: "flex-start", textTransform: "none", px: 0.5 }}
          >
            파일 첨부 ({files.length}/{MAX_FILES})
            <input
              type="file"
              hidden
              multiple
              onChange={handleFileSelect}
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.hwp"
            />
          </Button>
        )}
      </Box>
      {files.length > 0 && (
        <FilePreviewDialog
          files={files}
          currentIndex={previewIndex}
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          onNavigate={setPreviewIndex}
        />
      )}
    </>
  );
});

// ── 메모이제이션된 개별 항목 행 ──
interface ItemReviewInfo {
  status: "approved" | "rejected";
  reason?: string;
}

interface ChecklistItemRowProps {
  item: TrusteeChecklistItem;
  itemChange: ItemChange | undefined;
  isReadOnly: boolean;
  token: string;
  review?: ItemReviewInfo;
  onFieldChange: (itemId: string, field: keyof ItemChange, value: unknown) => void;
}

const ChecklistItemRow = memo(function ChecklistItemRow({
  item,
  itemChange,
  isReadOnly,
  token,
  review,
  onFieldChange,
}: ChecklistItemRowProps) {
  const applicable = itemChange?.applicable ?? item.applicable;
  const answer = (itemChange?.answer !== undefined ? itemChange.answer : item.answer) as string || "";
  const currentStatus = (itemChange?.currentStatus ?? item.currentStatus as string) || "";
  const remarks = (itemChange?.remarks ?? item.remarks as string) || "";
  const isRejected = review?.status === "rejected";

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        ...(isRejected && {
          borderColor: "error.main",
          borderWidth: 2,
        }),
      }}
    >
      {/* 반려 사유 표시 */}
      {isRejected && review?.reason && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          반려 사유: {review.reason}
        </Alert>
      )}

      {/* 헤더: 번호 + 질문 + 대상여부 */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, mb: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Chip label={item.no} size="small" variant="outlined" />
            <Typography variant="body2" fontWeight={600}>{item.question}</Typography>
          </Box>
          {item.hint && (
            <Typography variant="caption" color="text.secondary" sx={{ pl: 0.5 }}>
              {item.hint}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
          <Typography variant="caption" color="text.secondary">대상</Typography>
          <Switch
            size="small"
            checked={applicable}
            disabled={isReadOnly}
            onChange={(e) => onFieldChange(item.id, "applicable", e.target.checked)}
          />
        </Box>
      </Box>

      <Divider sx={{ mb: 1.5 }} />

      <Stack spacing={1.5}>
        {/* 답변 */}
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
            답변
          </Typography>
          <RadioGroup
            row
            value={answer}
            onChange={(e) => onFieldChange(item.id, "answer", e.target.value as ChecklistAnswer)}
          >
            <FormControlLabel
              value="yes"
              control={<Radio size="small" />}
              label="예"
              disabled={!applicable || isReadOnly}
              sx={{ mr: 2 }}
            />
            <FormControlLabel
              value="no"
              control={<Radio size="small" />}
              label="아니오"
              disabled={!applicable || isReadOnly}
              sx={{ mr: 2 }}
            />
            <FormControlLabel
              value="not_applicable"
              control={<Radio size="small" />}
              label="N/A"
              disabled={!applicable || isReadOnly}
            />
          </RadioGroup>
        </Box>

        {/* 이행 현황 */}
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
            이행 현황
          </Typography>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            maxRows={5}
            disabled={isReadOnly}
            value={currentStatus}
            onChange={(e) => onFieldChange(item.id, "currentStatus", e.target.value)}
            placeholder="현재 이행 현황을 작성해주세요"
          />
        </Box>

        {/* 증빙 자료 */}
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
            증빙 자료
          </Typography>
          <EvidenceFileUpload
            itemId={item.id}
            files={item.evidenceFiles || []}
            isReadOnly={isReadOnly}
            token={token}
          />
        </Box>

        {/* 비고 */}
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
            비고
          </Typography>
          <TextField
            size="small"
            fullWidth
            multiline
            maxRows={3}
            disabled={isReadOnly}
            value={remarks}
            onChange={(e) => onFieldChange(item.id, "remarks", e.target.value)}
            placeholder="비고 사항을 입력해주세요"
          />
        </Box>
      </Stack>
    </Paper>
  );
});

// ── 메모이제이션된 섹션 컴포넌트 ──
interface ChecklistSectionProps {
  section: TrusteeChecklistSection;
  changes: Record<string, ItemChange>;
  isReadOnly: boolean;
  token: string;
  reviewMap: Map<string, ItemReviewInfo>;
  onFieldChange: (itemId: string, field: keyof ItemChange, value: unknown) => void;
}

const ChecklistSectionBlock = memo(function ChecklistSectionBlock({
  section,
  changes,
  isReadOnly,
  token,
  reviewMap,
  onFieldChange,
}: ChecklistSectionProps) {
  return (
    <Accordion
      defaultExpanded={false}
      variant="outlined"
      sx={{ mb: 1 }}
    >
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
          {section.items.map((item) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              itemChange={changes[item.id]}
              isReadOnly={isReadOnly}
              token={token}
              review={reviewMap.get(item.id)}
              onFieldChange={onFieldChange}
            />
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}, (prev, next) => {
  // 섹션 내 아이템 변경이 있는지만 비교
  if (prev.isReadOnly !== next.isReadOnly) return false;
  if (prev.section !== next.section) return false;
  if (prev.onFieldChange !== next.onFieldChange) return false;
  if (prev.reviewMap !== next.reviewMap) return false;

  // 이 섹션에 속한 아이템들의 changes만 비교
  for (const item of prev.section.items) {
    if (prev.changes[item.id] !== next.changes[item.id]) return false;
  }
  return true;
});

// ── 메인 페이지 컴포넌트 ──
export default function ChecklistResponsePage() {
  const params = useParams();
  const token = params.token as string;
  const { data, isLoading, error } = useChecklistByToken(token);
  const { mutate: batchSave, isPending: isSaving } = useBatchSaveResponse(token);
  const { mutate: submitChecklist, isPending: isSubmitting } = useSubmitChecklist(token);
  const { mutate: reopenChecklist, isPending: isReopening } = useReopenChecklist(token);
  const { data: reviewsData } = useChecklistResponseReviews(token);

  const [changes, setChanges] = useState<Record<string, ItemChange>>({});
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const toast = useToast();
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Debounce 자동저장
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerAutoSave = useCallback(
    (updatedChanges: Record<string, ItemChange>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const items: BatchUpdateChecklistItemsInput["items"] = Object.entries(
          updatedChanges
        ).map(([id, change]) => ({ id, ...change }));
        if (items.length > 0) {
          batchSave(
            { items },
            {
              onSuccess: () => {
                setChanges({});
              },
            }
          );
        }
      }, 2000);
    },
    [batchSave]
  );

  const updateItemField = useCallback(
    (itemId: string, field: keyof ItemChange, value: unknown) => {
      setChanges((prev) => {
        const updated = {
          ...prev,
          [itemId]: { ...prev[itemId], [field]: value },
        };
        triggerAutoSave(updated);
        return updated;
      });
    },
    [triggerAutoSave]
  );

  const handleManualSave = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const items: BatchUpdateChecklistItemsInput["items"] = Object.entries(
      changes
    ).map(([id, change]) => ({ id, ...change }));
    if (items.length === 0) {
      toast.info("변경된 항목이 없습니다.");
      return;
    }
    batchSave(
      { items },
      {
        onSuccess: () => {
          setChanges({});
          toast.success("저장되었습니다.");
        },
      }
    );
  };

  const handleSubmitClick = () => {
    if (!contactName.trim()) {
      setContactError("담당자명은 필수입니다.");
      return;
    }
    setContactError(null);
    setSubmitDialogOpen(true);
  };

  const handleReopen = () => {
    reopenChecklist(undefined, {
      onSuccess: () => toast.success("재수정 모드로 전환되었습니다."),
    });
  };

  const handleSubmitConfirm = () => {
    setSubmitDialogOpen(false);

    // 미저장 변경사항 먼저 저장
    const pendingItems: BatchUpdateChecklistItemsInput["items"] =
      Object.entries(changes).map(([id, change]) => ({ id, ...change }));

    const doSubmit = () => {
      submitChecklist(
        {
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
        },
        {
          onSuccess: () => toast.success("제출이 완료되었습니다."),
        }
      );
    };

    if (pendingItems.length > 0) {
      batchSave({ items: pendingItems }, { onSuccess: () => { setChanges({}); doSubmit(); } });
    } else {
      doSubmit();
    }
  };

  // 반려 검토 결과 맵핑 (메모이제이션으로 불필요한 섹션 리렌더 방지)
  const reviews = reviewsData?.data || [];
  const reviewMap = useMemo(
    () => new Map(reviews.map((r) => [r.itemId, r])),
    [reviews]
  );

  // 진행률 계산 - debounce된 changes 수로 계산
  const checklist = data?.data;

  // 반려 항목 요약 목록
  const rejectedItems = useMemo(() => {
    if (!checklist || reviews.length === 0) return [];
    const rejected: { itemId: string; no: string; question: string; reason?: string }[] = [];
    for (const cat of checklist.categories) {
      for (const sec of cat.sections) {
        for (const item of sec.items) {
          const review = reviewMap.get(item.id);
          if (review?.status === "rejected") {
            rejected.push({ itemId: item.id, no: item.no, question: item.question, reason: review.reason });
          }
        }
      }
    }
    return rejected;
  }, [checklist, reviews, reviewMap]);
  const { totalItems, answeredItems, progress } = useMemo(() => {
    if (!checklist) return { totalItems: 0, answeredItems: 0, progress: 0 };

    let total = 0;
    let answered = 0;

    for (const cat of checklist.categories) {
      for (const sec of cat.sections) {
        for (const item of sec.items) {
          total++;
          const answer = changes[item.id]?.answer !== undefined
            ? changes[item.id]?.answer
            : item.answer;
          if (answer != null) answered++;
        }
      }
    }

    return {
      totalItems: total,
      answeredItems: answered,
      progress: total > 0 ? Math.round((answered / total) * 100) : 0,
    };
  }, [checklist, changes]);

  // 기한 만료 여부 (서버에서 isExpired 플래그 또는 클라이언트 계산)
  const isExpired = (checklist as Record<string, unknown>)?.isExpired === true
    || (checklist?.accessTokenExpiresAt
      ? new Date() > new Date(checklist.accessTokenExpiresAt)
      : false);

  const daysLeft = checklist?.accessTokenExpiresAt
    ? Math.ceil(
        (new Date(checklist.accessTokenExpiresAt).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  // 읽기 전용: 기한 만료 OR reviewed
  const isReadOnly = isExpired || checklist?.status === "reviewed";

  // submitted + 기한 내 = 재수정 가능
  const canReopen = checklist?.status === "submitted" && !isExpired;

  // 로딩 상태
  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  // 에러 상태
  if (error || !checklist) {
    const message = error instanceof Error ? error.message : "체크리스트를 찾을 수 없습니다.";
    return (
      <Box sx={{ pt: 4 }}>
        <Alert severity="error">{message}</Alert>
      </Box>
    );
  }

  const unansweredCount = totalItems - answeredItems;

  return (
    <Box>
      {/* 헤더 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {checklist.title}
        </Typography>
        {checklist.inspectionScope && (
          <Typography variant="body1" color="text.secondary">
            점검 범위: {checklist.inspectionScope}
          </Typography>
        )}
        {/* 기한 안내 */}
        {daysLeft !== null && !isExpired && checklist.status !== "reviewed" && (
          <Alert severity={daysLeft <= 3 ? "warning" : "info"} sx={{ mt: 2 }}>
            작성 기한: {new Date(checklist.accessTokenExpiresAt).toLocaleDateString("ko-KR")}
            {daysLeft > 0 ? ` (D-${daysLeft})` : " (오늘 마감)"}
          </Alert>
        )}
        {isExpired && checklist.status !== "reviewed" && (
          <Alert severity="error" sx={{ mt: 2 }}>
            작성 기한이 종료되었습니다. 더 이상 수정할 수 없습니다.
          </Alert>
        )}
        {checklist.status === "reviewed" && (
          <Alert severity="success" sx={{ mt: 2 }}>
            위탁사 검토가 완료되었습니다.
          </Alert>
        )}
        {checklist.status === "rejected" && (
          <Alert severity="error" sx={{ mt: 2 }}>
            반려되었습니다. 아래 반려 항목을 확인하고 보완 후 재제출해주세요.
          </Alert>
        )}
        {canReopen && (
          <Alert
            severity="info"
            sx={{ mt: 2 }}
            action={
              <Button
                variant="outlined"
                size="small"
                loading={isReopening}
                onClick={handleReopen}
              >
                재수정
              </Button>
            }
          >
            제출이 완료되었습니다. 기한 내에 재수정이 가능합니다.
          </Alert>
        )}
      </Box>

      {/* 반려 항목 요약 패널 */}
      {rejectedItems.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            mb: 3,
            borderColor: "error.main",
            borderWidth: 2,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 2.5,
              py: 1.5,
              bgcolor: "error.main",
              color: "error.contrastText",
            }}
          >
            <ErrorOutlineIcon fontSize="small" />
            <Typography variant="subtitle2" fontWeight={700}>
              반려 항목 {rejectedItems.length}건
            </Typography>
          </Box>
          <Stack spacing={0} divider={<Divider />}>
            {rejectedItems.map((ri) => (
              <Box key={ri.itemId} sx={{ px: 2.5, py: 1.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: ri.reason ? 0.5 : 0 }}>
                  <Chip label={ri.no} size="small" variant="outlined" color="error" />
                  <Typography variant="body2" fontWeight={600}>
                    {ri.question}
                  </Typography>
                </Box>
                {ri.reason && (
                  <Typography variant="body2" color="error.main" sx={{ pl: 0.5 }}>
                    {ri.reason}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* 작성자 정보 */}
      {!isReadOnly && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            작성자 정보
          </Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <TextField
              label="담당자명"
              required
              size="small"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              error={!!contactError}
              helperText={contactError}
              sx={{ minWidth: 200 }}
            />
            <TextField
              label="이메일"
              size="small"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              sx={{ minWidth: 250 }}
            />
            <TextField
              label="연락처"
              size="small"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              sx={{ minWidth: 180 }}
            />
          </Box>
        </Paper>
      )}

      {/* 제출 완료 시 작성자 정보 표시 */}
      {isReadOnly && checklist.contactName && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            작성자 정보
          </Typography>
          <Typography>담당자: {checklist.contactName}</Typography>
          {checklist.contactEmail && (
            <Typography>이메일: {checklist.contactEmail}</Typography>
          )}
          {checklist.contactPhone && (
            <Typography>연락처: {checklist.contactPhone}</Typography>
          )}
        </Paper>
      )}

      {/* 진행률 */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
          <Typography variant="body2" fontWeight={600}>
            진행률
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {answeredItems}/{totalItems} 항목 ({progress}%)
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Paper>

      {/* 범주별 아코디언 */}
      {checklist.categories.map((category) => {
        const catItemCount = category.sections.reduce(
          (sum, sec) => sum + sec.items.length,
          0
        );
        return (
          <Accordion key={category.id} defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Chip label={`${category.no}`} size="small" color="primary" />
                <Typography fontWeight={600}>{category.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  ({catItemCount}개 항목)
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {category.sections.map((section) => (
                <ChecklistSectionBlock
                  key={section.id}
                  section={section}
                  changes={changes}
                  isReadOnly={isReadOnly}
                  token={token}
                  reviewMap={reviewMap}
                  onFieldChange={updateItemField}
                />
              ))}
            </AccordionDetails>
          </Accordion>
        );
      })}

      {/* 하단 버튼 */}
      {!isReadOnly && (
        <Box
          sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 3, mb: 4 }}
        >
          <Button variant="outlined" loading={isSaving} onClick={handleManualSave}>
            임시저장
          </Button>
          <Button
            variant="contained"
            loading={isSubmitting}
            onClick={handleSubmitClick}
          >
            제출
          </Button>
        </Box>
      )}

      {/* 제출 확인 Dialog */}
      <Dialog open={submitDialogOpen} onClose={() => setSubmitDialogOpen(false)}>
        <DialogTitle>체크리스트 제출</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {unansweredCount > 0
              ? `${unansweredCount}개의 미답변 항목이 있습니다. 그래도 제출하시겠습니까?`
              : "체크리스트를 제출하시겠습니까?"}
            {" "}기한 내에는 재수정 후 다시 제출할 수 있습니다.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubmitDialogOpen(false)}>취소</Button>
          <Button variant="contained" onClick={handleSubmitConfirm}>
            제출
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
