"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Grid from "@mui/material/Grid2";
import Radio from "@mui/material/Radio";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import {
  PageHeader,
  Button,
  Form,
  FormTextField,
  FormSelect,
  Dialog,
  Breadcrumb,
  Box,
  Paper,
  CircularProgress,
  Typography,
} from "@trustee/ui";
import { spacing, colors } from "@trustee/ui";
import { useTrustee, useUpdateTrustee, useDeleteTrustee } from "@/hooks";

const contactSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "담당자명은 필수입니다"),
  phone: z.string().optional(),
  email: z
    .string()
    .email("유효한 이메일을 입력해주세요")
    .optional()
    .or(z.literal("")),
  department: z.string().optional(),
  position: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

const trusteeFormSchema = z
  .object({
    companyName: z.string().min(1, "회사명은 필수입니다"),
    businessNumber: z.string().optional(),
    representative: z.string().optional(),
    delegatedTasks: z.string().min(1, "위탁 업무는 필수입니다"),
    status: z.enum(["active", "inactive", "pending"]).default("pending"),
    contacts: z
      .array(contactSchema)
      .min(1, "최소 1명의 담당자가 필요합니다"),
  })
  .refine((data) => data.contacts.some((c) => c.isPrimary), {
    message: "주담당자를 1명 지정해주세요",
    path: ["contacts"],
  });

type TrusteeFormData = z.infer<typeof trusteeFormSchema>;

const statusOptions = [
  { value: "pending", label: "대기" },
  { value: "active", label: "활성" },
  { value: "inactive", label: "비활성" },
];

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TrusteeDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading } = useTrustee(id);
  const { mutate: updateMutate, isPending: isUpdating } = useUpdateTrustee();
  const { mutate: deleteMutate, isPending: isDeleting } = useDeleteTrustee();

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<TrusteeFormData>({
    resolver: zodResolver(trusteeFormSchema),
    defaultValues: {
      status: "pending",
      contacts: [
        {
          name: "",
          phone: "",
          email: "",
          department: "",
          position: "",
          isPrimary: true,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "contacts",
  });

  useEffect(() => {
    if (data?.data) {
      const trustee = data.data;
      reset({
        companyName: trustee.companyName,
        businessNumber: trustee.businessNumber ?? "",
        representative: trustee.representative ?? "",
        delegatedTasks: trustee.delegatedTasks,
        status: trustee.status,
        contacts: trustee.contacts.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone ?? "",
          email: c.email ?? "",
          department: c.department ?? "",
          position: c.position ?? "",
          isPrimary: c.isPrimary,
        })),
      });
    }
  }, [data, reset]);

  const handlePrimaryChange = (index: number) => {
    fields.forEach((_, i) => {
      setValue(`contacts.${i}.isPrimary`, i === index);
    });
  };

  const handleRemoveContact = (index: number) => {
    if (fields.length <= 1) return;
    const wasPrimary = watch(`contacts.${index}.isPrimary`);
    remove(index);
    if (wasPrimary) {
      setValue("contacts.0.isPrimary", true);
    }
  };

  const onSubmit = (formData: TrusteeFormData) => {
    updateMutate(
      { id, data: formData },
      { onSuccess: () => router.push("/trustees") },
    );
  };

  const handleDelete = () => {
    deleteMutate(id, {
      onSuccess: () => router.push("/trustees"),
    });
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          p: `${spacing.pageInset}px`,
          display: "flex",
          justifyContent: "center",
          pt: 10,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!data?.data) {
    return (
      <Box sx={{ p: `${spacing.pageInset}px`, textAlign: "center", pt: 10 }}>
        <Typography variant="body1" sx={{ color: colors.fg.tertiary, mb: 2 }}>
          수탁사를 찾을 수 없습니다.
        </Typography>
        <Button variant="contained" onClick={() => router.push("/trustees")}>
          목록으로
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: `${spacing.pageInset}px` }}>
      <Breadcrumb
        items={[
          { label: "대시보드", href: "/" },
          { label: "수탁사 관리", href: "/trustees" },
          { label: data?.data?.companyName || "수탁사 상세" },
        ]}
        onNavigate={(href) => router.push(href)}
      />
      <PageHeader
        title="수탁사 상세"
        actions={
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteOpen(true)}
          >
            삭제
          </Button>
        }
      />

      <Paper
        sx={{
          p: 3,
          backgroundColor: colors.bg.level1,
          maxWidth: 900,
        }}
      >
        <Form onSubmit={handleSubmit(onSubmit)}>
          {/* 기본 정보 */}
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
            기본 정보
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormTextField
                label="회사명"
                required
                {...register("companyName")}
                error={errors.companyName?.message}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormTextField
                label="사업자번호"
                {...register("businessNumber")}
                error={errors.businessNumber?.message}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormTextField
                label="대표자"
                {...register("representative")}
                error={errors.representative?.message}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormSelect
                label="상태"
                name="status"
                value={watch("status") ?? "pending"}
                onChange={(e) =>
                  setValue("status", e.target.value as TrusteeFormData["status"])
                }
                options={statusOptions}
                error={errors.status?.message}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormTextField
                label="위탁 업무"
                required
                multiline
                rows={3}
                {...register("delegatedTasks")}
                error={errors.delegatedTasks?.message}
              />
            </Grid>
          </Grid>

          {/* 담당자 정보 */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mt: 4,
              mb: 2,
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              담당자 정보
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() =>
                append({
                  name: "",
                  phone: "",
                  email: "",
                  department: "",
                  position: "",
                  isPrimary: false,
                })
              }
            >
              담당자 추가
            </Button>
          </Box>

          {errors.contacts?.root?.message && (
            <Typography variant="body2" sx={{ color: "error.main", mb: 1 }}>
              {errors.contacts.root.message}
            </Typography>
          )}

          {fields.map((field, index) => (
            <Paper
              key={field.id}
              variant="outlined"
              sx={{ p: 2, mb: 1.5 }}
            >
              <Grid container spacing={1.5} alignItems="center">
                <Grid size={{ xs: "auto" }}>
                  <Radio
                    checked={watch(`contacts.${index}.isPrimary`)}
                    onChange={() => handlePrimaryChange(index)}
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 2 }}>
                  <FormTextField
                    label="이름"
                    size="small"
                    required
                    {...register(`contacts.${index}.name`)}
                    error={errors.contacts?.[index]?.name?.message}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 2 }}>
                  <FormTextField
                    label="연락처"
                    size="small"
                    {...register(`contacts.${index}.phone`)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 2 }}>
                  <FormTextField
                    label="이메일"
                    size="small"
                    {...register(`contacts.${index}.email`)}
                    error={errors.contacts?.[index]?.email?.message}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 2 }}>
                  <FormTextField
                    label="부서"
                    size="small"
                    {...register(`contacts.${index}.department`)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 2 }}>
                  <FormTextField
                    label="직책"
                    size="small"
                    {...register(`contacts.${index}.position`)}
                  />
                </Grid>
                <Grid size={{ xs: "auto" }}>
                  <IconButton
                    size="small"
                    onClick={() => handleRemoveContact(index)}
                    disabled={fields.length <= 1}
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Grid>
              </Grid>
            </Paper>
          ))}

          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 1,
              mt: 3,
            }}
          >
            <Button onClick={() => router.push("/trustees")}>목록으로</Button>
            <Button variant="contained" type="submit" loading={isUpdating}>
              저장
            </Button>
          </Box>
        </Form>
      </Paper>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="수탁사 삭제"
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setDeleteOpen(false)}>취소</Button>
            <Button
              variant="contained"
              color="error"
              loading={isDeleting}
              onClick={handleDelete}
            >
              삭제
            </Button>
          </>
        }
      >
        <Typography variant="body2" sx={{ color: colors.fg.secondary }}>
          이 수탁사를 삭제하시겠습니까? 관련된 계약 및 점검 정보도 함께
          삭제됩니다.
        </Typography>
      </Dialog>
    </Box>
  );
}
