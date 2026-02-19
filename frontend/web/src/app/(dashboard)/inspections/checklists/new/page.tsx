"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LinkIcon from "@mui/icons-material/Link";
import {
  PageHeader,
  Button,
  Box,
  FormTextField,
  CircularProgress,
  Dialog,
} from "@trustee/ui";
import { spacing } from "@trustee/ui";
import { useChecklistTemplates, useTrustees, useCreateTrusteeChecklist } from "@/hooks";

export default function NewChecklistPage() {
  const router = useRouter();
  const [trusteeId, setTrusteeId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [inspectionScope, setInspectionScope] = useState("");
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  });
  const [error, setError] = useState<string | null>(null);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: templatesData, isLoading: templatesLoading } = useChecklistTemplates({ limit: 100 });
  const { data: trusteesData, isLoading: trusteesLoading } = useTrustees({ limit: 100 });
  const { mutate: createChecklist, isPending } = useCreateTrusteeChecklist();

  const tokenUrl = createdToken
    ? `${window.location.origin}/checklist/${createdToken}`
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!trusteeId || !templateId) {
      setError("수탁사와 템플릿을 선택해주세요.");
      return;
    }

    if (!deadline) {
      setError("작성 기한을 설정해주세요.");
      return;
    }

    createChecklist(
      {
        trusteeId,
        templateId,
        inspectionScope: inspectionScope || undefined,
        deadline: new Date(deadline + "T23:59:59").toISOString(),
      },
      {
        onSuccess: (res) => {
          const token = res.data.accessToken;
          if (token) {
            setCreatedToken(token);
            setTokenDialogOpen(true);
          } else {
            router.push("/inspections/checklists");
          }
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "생성에 실패했습니다.");
        },
      }
    );
  };

  if (templatesLoading || trusteesLoading) {
    return (
      <Box sx={{ p: `${spacing.pageInset}px`, display: "flex", justifyContent: "center", pt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: `${spacing.pageInset}px` }}>
      <PageHeader
        title="체크리스트 생성"
        description="템플릿을 선택하여 수탁사별 보안점검 체크리스트를 생성합니다."
      />

      <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 600 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          select
          fullWidth
          label="수탁사 선택"
          value={trusteeId}
          onChange={(e) => setTrusteeId(e.target.value)}
          sx={{ mb: 2 }}
          required
        >
          {(trusteesData?.data ?? []).map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.companyName} {t.businessNumber ? `(${t.businessNumber})` : ""}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          fullWidth
          label="템플릿 선택"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          sx={{ mb: 2 }}
          required
        >
          {(templatesData?.data ?? []).map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.title} (v{t.version})
            </MenuItem>
          ))}
        </TextField>

        <TextField
          fullWidth
          label="작성 기한"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          required
          slotProps={{ inputLabel: { shrink: true } }}
          helperText="수탁사가 체크리스트를 작성할 수 있는 마감일입니다."
          sx={{ mb: 2 }}
        />

        <FormTextField
          label="점검 범위 (선택)"
          name="inspectionScope"
          value={inspectionScope}
          onChange={(e) => setInspectionScope(e.target.value)}
          multiline
          rows={3}
          placeholder="점검 대상 범위를 입력하세요..."
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" onClick={() => router.back()}>
            취소
          </Button>
          <Button type="submit" variant="contained" loading={isPending}>
            생성
          </Button>
        </Box>
      </Box>

      <Dialog
        open={tokenDialogOpen}
        onClose={() => {
          setTokenDialogOpen(false);
          router.push("/inspections/checklists");
        }}
        title="체크리스트가 생성되었습니다"
        maxWidth="sm"
        actions={
          <Button
            variant="contained"
            onClick={() => {
              setTokenDialogOpen(false);
              router.push("/inspections/checklists");
            }}
          >
            확인
          </Button>
        }
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          아래 링크를 수탁사 담당자에게 전달하세요. 담당자가 링크를 통해 체크리스트를 작성하고 제출할 수 있습니다.
        </Typography>
        <TextField
          fullWidth
          value={tokenUrl}
          slotProps={{
            input: {
              readOnly: true,
              startAdornment: (
                <InputAdornment position="start">
                  <LinkIcon color="primary" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={handleCopyLink} size="small">
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
          size="small"
          sx={{ bgcolor: "grey.50" }}
        />
        {copied && (
          <Typography variant="caption" color="success.main" sx={{ mt: 0.5 }}>
            링크가 복사되었습니다!
          </Typography>
        )}
      </Dialog>
    </Box>
  );
}
