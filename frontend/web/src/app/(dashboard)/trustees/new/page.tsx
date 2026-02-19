"use client";

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
  Box,
  Paper,
  Typography,
} from "@trustee/ui";
import { spacing, colors } from "@trustee/ui";
import { useCreateTrustee } from "@/hooks";

const contactSchema = z.object({
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

export default function NewTrusteePage() {
  const router = useRouter();
  const { mutate, isPending } = useCreateTrustee();

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
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

  const onSubmit = (data: TrusteeFormData) => {
    mutate(data, {
      onSuccess: () => router.push("/trustees"),
    });
  };

  return (
    <Box sx={{ p: `${spacing.pageInset}px` }}>
      <PageHeader title="수탁사 등록" />

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
                value={watch("status")}
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
            <Button onClick={() => router.push("/trustees")}>취소</Button>
            <Button variant="contained" type="submit" loading={isPending}>
              등록
            </Button>
          </Box>
        </Form>
      </Paper>
    </Box>
  );
}
