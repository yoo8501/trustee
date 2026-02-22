"use client";

import { useState, useCallback } from "react";
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
import IconButton from "@mui/material/IconButton";
import MuiDialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DownloadIcon from "@mui/icons-material/Download";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { Button, Box } from "@trustee/ui";
import type { EvidenceFile, ChecklistDiffItem, TrusteeChecklistCategory } from "@trustee/types";
import { checklistResponseApi } from "@/lib/api";

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
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton size="small" component="a" href={fileUrl} download={file.fileName} title="다운로드">
            <DownloadIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onClose} title="닫기">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
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
                position: "absolute", left: 8, zIndex: 1,
                bgcolor: "background.paper", boxShadow: 1,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <NavigateBeforeIcon />
            </IconButton>
            <IconButton
              onClick={() => onNavigate(currentIndex + 1)}
              disabled={!hasNext}
              sx={{
                position: "absolute", right: 8, zIndex: 1,
                bgcolor: "background.paper", boxShadow: 1,
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

// ── 증빙파일 목록 ──
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
              display: "flex", alignItems: "center", gap: 0.5, p: 0.5,
              borderRadius: 1, bgcolor: "action.hover", cursor: "pointer",
              "&:hover": { bgcolor: "action.selected" },
            }}
            onClick={() => handlePreview(index)}
          >
            {file.mimeType.startsWith("image/") ? (
              <Box
                component="img"
                src={checklistResponseApi.getFileUrl(file.storagePath)}
                alt={file.fileName}
                sx={{ width: 28, height: 28, objectFit: "cover", borderRadius: 0.5, flexShrink: 0 }}
              />
            ) : (
              <InsertDriveFileIcon sx={{ fontSize: 16, color: "action.active", flexShrink: 0 }} />
            )}
            <Typography
              variant="caption"
              sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
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

// ── 카테고리 뷰 Props ──
interface ReviewItem {
  itemId: string;
  status: string;
  reason?: string;
}

interface DiffData {
  previousRound: number;
  currentRound: number;
  changes: ChecklistDiffItem[];
}

export interface ChecklistCategoryViewProps {
  categories: TrusteeChecklistCategory[];
  showDiff: boolean;
  diffData?: DiffData | null;
  reviews: ReviewItem[];
}

export function ChecklistCategoryView({ categories, showDiff, diffData, reviews }: ChecklistCategoryViewProps) {
  const diffMap = new Map<string, ChecklistDiffItem>(
    (diffData?.changes || []).map((c) => [c.itemId, c])
  );
  const reviewMap = new Map(reviews.map((r) => [r.itemId, r]));

  return (
    <>
      {categories.map((category) => {
        const totalItems = category.sections.reduce((sum, sec) => sum + sec.items.length, 0);
        const yesCount = category.sections.reduce(
          (sum, sec) => sum + sec.items.filter((i) => i.answer === "yes").length, 0
        );
        const noCount = category.sections.reduce(
          (sum, sec) => sum + sec.items.filter((i) => i.answer === "no").length, 0
        );
        const hasAnswers = yesCount > 0 || noCount > 0;

        return (
          <Accordion key={category.id} defaultExpanded={false}>
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
                            {itemReview?.status === "rejected" && itemReview.reason && (
                              <Alert severity="error" sx={{ mb: 1.5 }}>
                                반려 사유: {itemReview.reason}
                              </Alert>
                            )}

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
                                      item.answer === "yes" ? "success"
                                        : item.answer === "no" ? "error"
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
                              <Box>
                                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
                                  이행 현황
                                </Typography>
                                <Typography variant="body2">
                                  {(item.currentStatus as string) || "-"}
                                </Typography>
                              </Box>

                              <Box>
                                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
                                  증빙 자료
                                </Typography>
                                <EvidenceFileList files={item.evidenceFiles || []} />
                              </Box>

                              {(item.remarks as string) && (
                                <Box>
                                  <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
                                    비고
                                  </Typography>
                                  <Typography variant="body2">{item.remarks as string}</Typography>
                                </Box>
                              )}

                              {itemDiff && showDiff && (
                                <Box sx={{ mt: 1, p: 1.5, bgcolor: "#232326", borderRadius: 1, border: 1, borderColor: "#34343a" }}>
                                  <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: "block", color: "#4ea7fc" }}>
                                    변경사항 (제출 {diffData?.previousRound}차 → {diffData?.currentRound}차)
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
    </>
  );
}
