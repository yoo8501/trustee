"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import MuiLink from "@mui/material/Link";
import NextLink from "next/link";
import { Button, Form, FormTextField } from "@trustee/ui";
import { authApi } from "@/lib/api";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormData,
} from "@/lib/validations/auth";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setError(null);
    try {
      await authApi.forgotPassword(data);
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "요청에 실패했습니다. 다시 시도해주세요.",
      );
    }
  };

  if (sent) {
    return (
      <Box textAlign="center">
        <Typography variant="h5" fontWeight={700} gutterBottom>
          이메일을 확인해주세요
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          비밀번호 재설정 링크가 이메일로 발송되었습니다.
          <br />
          이메일을 확인하고 링크를 클릭해주세요.
        </Typography>
        <MuiLink component={NextLink} href="/login" underline="hover">
          로그인으로 돌아가기
        </MuiLink>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} textAlign="center" gutterBottom>
        비밀번호 찾기
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        textAlign="center"
        sx={{ mb: 3 }}
      >
        가입한 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Form onSubmit={handleSubmit(onSubmit)}>
        <FormTextField
          label="이메일"
          type="email"
          autoComplete="email"
          autoFocus
          {...register("email")}
          error={errors.email?.message}
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          loading={isSubmitting}
          sx={{ mt: 2, mb: 2, py: 1.2 }}
        >
          재설정 링크 발송
        </Button>
      </Form>

      <Typography variant="body2" textAlign="center">
        <MuiLink component={NextLink} href="/login" underline="hover">
          로그인으로 돌아가기
        </MuiLink>
      </Typography>
    </Box>
  );
}
