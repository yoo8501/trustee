"use client";

import { useState, useCallback, useEffect, memo } from "react";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import { Button, Box, Dialog } from "@trustee/ui";
import type { RejectChecklistInput } from "@trustee/types";

// ── 반려 다이얼로그 아이템 행 (memo) ──
export const RejectItemRow = memo(function RejectItemRow({
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

// ── 반려 다이얼로그 ──
interface RejectDialogProps {
  open: boolean;
  onClose: () => void;
  categories: { sections: { items: { id: string; no: string; question: string }[] }[] }[];
  isRejecting: boolean;
  onSubmit: (items: RejectChecklistInput["items"], newDeadline: string) => void;
  onError: (msg: string) => void;
}

export function RejectDialogContent({ open, onClose, categories, isRejecting, onSubmit, onError }: RejectDialogProps) {
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

// ── 검토 완료 확인 다이얼로그 ──
interface ConfirmReviewDialogProps {
  open: boolean;
  onClose: () => void;
  isReviewing: boolean;
  onConfirm: () => void;
}

export function ConfirmReviewDialog({ open, onClose, isReviewing, onConfirm }: ConfirmReviewDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="검토 완료"
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="contained" color="success" loading={isReviewing} onClick={onConfirm}>
            완료
          </Button>
        </>
      }
    >
      <Typography>이 체크리스트를 검토 완료로 처리하시겠습니까?</Typography>
    </Dialog>
  );
}

// ── 토큰 재발급 확인 다이얼로그 ──
interface ConfirmRegenerateDialogProps {
  open: boolean;
  onClose: () => void;
  isRegenerating: boolean;
  onConfirm: () => void;
}

export function ConfirmRegenerateDialog({ open, onClose, isRegenerating, onConfirm }: ConfirmRegenerateDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="토큰 재발급"
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="contained" color="warning" loading={isRegenerating} onClick={onConfirm}>
            재발급
          </Button>
        </>
      }
    >
      <Typography>
        토큰을 재발급하면 기존 링크는 더 이상 사용할 수 없습니다. 계속하시겠습니까?
      </Typography>
    </Dialog>
  );
}

// ── 기한 변경 다이얼로그 ──
interface DeadlineEditDialogProps {
  open: boolean;
  onClose: () => void;
  deadline: string;
  onDeadlineChange: (value: string) => void;
  onConfirm: () => void;
}

export function DeadlineEditDialog({ open, onClose, deadline, onDeadlineChange, onConfirm }: DeadlineEditDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="작성 기한 변경"
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="contained" onClick={onConfirm}>변경</Button>
        </>
      }
    >
      <TextField
        type="date"
        fullWidth
        label="새 기한"
        value={deadline}
        onChange={(e) => onDeadlineChange(e.target.value)}
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
  );
}
