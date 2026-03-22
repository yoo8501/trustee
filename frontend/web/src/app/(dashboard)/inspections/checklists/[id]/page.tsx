"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import {
  PageHeader,
  Button,
  Box,
  CircularProgress,
  Breadcrumb,
} from "@trustee/ui";
import { spacing } from "@trustee/ui";
import type { RejectChecklistInput } from "@trustee/types";
import { ScorePanel } from "@/components/ScorePanel";
import { InspectionRadarChart } from "@/components/InspectionRadarChart";
import { DeficientItemsPanel } from "@/components/DeficientItemsPanel";
import { ChecklistInfoCard } from "@/components/ChecklistInfoCard";
import { ChecklistCategoryView } from "@/components/ChecklistCategoryView";
import {
  RejectDialogContent,
  ConfirmReviewDialog,
  ConfirmRegenerateDialog,
  DeadlineEditDialog,
} from "@/components/ChecklistActionDialogs";
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

  const { data: snapshotsData } = useChecklistSnapshots(
    checklist && checklist.submissionCount >= 2 ? id : "",
  );
  const snapshots = snapshotsData?.data || [];

  const { data: diffData } = useChecklistDiff(
    showDiff && checklist && checklist.submissionCount >= 2 ? id : "",
    selectedRound,
  );
  const { data: reviewsData } = useChecklistReviews(
    checklist && checklist.reviewRound > 0 ? id : "",
  );
  const reviews = reviewsData?.data || [];

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

  const handleRejectSubmit = (items: RejectChecklistInput["items"], deadline: string) => {
    rejectChecklist(
      { id, data: { items, newDeadline: deadline } },
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
      <Breadcrumb
        items={[
          { label: "대시보드", href: "/" },
          { label: "점검 관리", href: "/inspections" },
          { label: "수탁사 체크리스트", href: "/inspections/checklists" },
          { label: checklist.title },
        ]}
        onNavigate={(href) => router.push(href)}
      />
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
                  onClick={() => setRejectDialogOpen(true)}
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

      {/* 통합 정보 카드 */}
      <ChecklistInfoCard
        tokenUrl={tokenUrl}
        deadline={checklist.accessTokenExpiresAt}
        isExpired={isDeadlineExpired}
        daysLeft={daysLeft}
        contactName={checklist.contactName}
        contactEmail={checklist.contactEmail}
        contactPhone={checklist.contactPhone}
        submittedAt={checklist.submittedAt}
        submissionCount={checklist.submissionCount}
        status={checklist.status}
        onCopyLink={handleCopyLink}
        onRegenerate={() => setConfirmRegenerateOpen(true)}
        onDeadlineEdit={() => {
          setNewDeadline(new Date(checklist.accessTokenExpiresAt).toISOString().split("T")[0]);
          setDeadlineEditOpen(true);
        }}
        copied={copied}
        isRegenerating={isRegenerating}
      />

      {/* 스코어 패널 + 레이더 차트 */}
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

      {/* 미흡 항목 패널 */}
      {(checklist.status === "submitted" || checklist.status === "reviewed") && (
        <DeficientItemsPanel categories={checklist.categories} />
      )}

      {/* 카테고리 항목 (읽기 전용) */}
      <ChecklistCategoryView
        categories={checklist.categories}
        showDiff={showDiff}
        diffData={diffData?.data}
        reviews={reviews}
      />

      {/* 다이얼로그들 */}
      <ConfirmReviewDialog
        open={confirmReviewOpen}
        onClose={() => setConfirmReviewOpen(false)}
        isReviewing={isReviewingMut}
        onConfirm={handleReviewComplete}
      />

      <RejectDialogContent
        open={rejectDialogOpen}
        onClose={() => setRejectDialogOpen(false)}
        categories={checklist.categories}
        isRejecting={isRejecting}
        onSubmit={handleRejectSubmit}
        onError={(msg) => toast.warning(msg)}
      />

      <ConfirmRegenerateDialog
        open={confirmRegenerateOpen}
        onClose={() => setConfirmRegenerateOpen(false)}
        isRegenerating={isRegenerating}
        onConfirm={handleRegenerateToken}
      />

      <DeadlineEditDialog
        open={deadlineEditOpen}
        onClose={() => setDeadlineEditOpen(false)}
        deadline={newDeadline}
        onDeadlineChange={setNewDeadline}
        onConfirm={handleDeadlineChange}
      />
    </Box>
  );
}
