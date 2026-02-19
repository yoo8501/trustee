"use client";

import { useParams, useRouter } from "next/navigation";
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
import DeleteIcon from "@mui/icons-material/Delete";
import {
  PageHeader,
  Button,
  Box,
  CircularProgress,
  Dialog,
} from "@trustee/ui";
import { spacing } from "@trustee/ui";
import { useChecklistTemplate, useDeleteChecklistTemplate } from "@/hooks";
import { useState } from "react";

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data, isLoading } = useChecklistTemplate(id);
  const { mutate: deleteTemplate, isPending: isDeleting } = useDeleteChecklistTemplate();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) {
    return (
      <Box sx={{ p: `${spacing.pageInset}px`, display: "flex", justifyContent: "center", pt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const template = data?.data;
  if (!template) {
    return (
      <Box sx={{ p: `${spacing.pageInset}px` }}>
        <Typography>템플릿을 찾을 수 없습니다.</Typography>
      </Box>
    );
  }

  const totalItems = template.categories.reduce(
    (sum, cat) => sum + cat.sections.reduce((s, sec) => s + sec.items.length, 0),
    0
  );

  const handleDelete = () => {
    deleteTemplate(id, {
      onSuccess: () => router.push("/inspections/templates"),
    });
  };

  return (
    <Box sx={{ p: `${spacing.pageInset}px` }}>
      <PageHeader
        title={template.title}
        description={`버전 ${template.version} | ${template.categories.length}개 범주 | ${totalItems}개 항목`}
        actions={
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="outlined"
              onClick={() => router.push("/inspections/templates")}
            >
              목록
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setDeleteOpen(true)}
            >
              삭제
            </Button>
          </Box>
        }
      />

      {template.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {template.description}
        </Typography>
      )}

      {template.categories.map((category) => (
        <Accordion key={category.id} defaultExpanded={false}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Chip label={`${category.no}`} size="small" color="primary" />
              <Typography fontWeight={600}>{category.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                ({category.sections.reduce((sum, sec) => sum + sec.items.length, 0)}개 항목)
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
                          <TableCell sx={{ width: 80 }}>No</TableCell>
                          <TableCell>통제 항목</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {section.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.no}</TableCell>
                            <TableCell>{item.question}</TableCell>
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
      ))}

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="템플릿 삭제"
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setDeleteOpen(false)}>취소</Button>
            <Button variant="contained" color="error" loading={isDeleting} onClick={handleDelete}>
              삭제
            </Button>
          </>
        }
      >
        이 템플릿을 삭제하시겠습니까? 삭제해도 이미 생성된 수탁사 체크리스트에는 영향이 없습니다.
      </Dialog>
    </Box>
  );
}
