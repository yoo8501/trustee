"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import {
  PageHeader,
  Button,
  Box,
  FormTextField,
} from "@trustee/ui";
import { spacing } from "@trustee/ui";
import { useImportChecklistTemplate } from "@/hooks";

export default function NewTemplatePage() {
  const router = useRouter();
  const { mutate: importTemplate, isPending } = useImportChecklistTemplate();
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileContent = useCallback((text: string) => {
    setJsonText(text);
    setError(null);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      handleFileContent(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      handleFileContent(event.target?.result as string);
    };
    reader.readAsText(file);
  }, [handleFileContent]);

  const handleImport = () => {
    setError(null);

    try {
      const parsed = JSON.parse(jsonText);

      if (!parsed.categories || !Array.isArray(parsed.categories)) {
        setError("JSON에 categories 배열이 필요합니다.");
        return;
      }

      importTemplate(parsed, {
        onSuccess: () => {
          router.push("/inspections/templates");
        },
      });
    } catch {
      setError("유효한 JSON 형식이 아닙니다.");
    }
  };

  return (
    <Box sx={{ p: `${spacing.pageInset}px` }}>
      <PageHeader
        title="템플릿 생성"
        description="JSON 파일을 업로드하거나 붙여넣어 체크리스트 템플릿을 생성합니다."
      />

      <Box sx={{ maxWidth: 800 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* 파일 업로드 영역 */}
        <Paper
          variant="outlined"
          component="label"
          onDragOver={(e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          sx={{
            p: 3,
            mb: 2,
            textAlign: "center",
            border: "2px dashed",
            borderColor: isDragOver ? "primary.main" : "divider",
            bgcolor: isDragOver ? "action.hover" : "transparent",
            cursor: "pointer",
            transition: "all 0.2s",
            "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
          }}
        >
          <UploadFileIcon sx={{ fontSize: 40, color: "text.secondary", mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            JSON 파일을 드래그하거나 클릭하여 업로드하세요
          </Typography>
          <Typography variant="caption" color="text.disabled">
            .json 파일만 지원됩니다
          </Typography>
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={handleFileUpload}
          />
        </Paper>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          또는 JSON을 직접 붙여넣으세요
        </Typography>

        <FormTextField
          label="JSON 데이터"
          name="jsonData"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          multiline
          rows={20}
          placeholder='{"title": "보안점검 체크리스트", "categories": [...]}'
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => router.back()}
          >
            취소
          </Button>
          <Button
            variant="contained"
            loading={isPending}
            onClick={handleImport}
            disabled={!jsonText.trim()}
          >
            Import
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
