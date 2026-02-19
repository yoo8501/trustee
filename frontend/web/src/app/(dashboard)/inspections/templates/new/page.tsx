"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
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
        onError: (err) => {
          setError(err instanceof Error ? err.message : "Import에 실패했습니다.");
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
        description="JSON 파일을 붙여넣어 체크리스트 템플릿을 생성합니다."
      />

      <Box sx={{ maxWidth: 800 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          inspection-checklist-template.json 형식의 JSON을 붙여넣으세요.
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
