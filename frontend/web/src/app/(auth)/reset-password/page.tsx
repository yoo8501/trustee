"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import NextLink from "next/link";
import { Box, Typography, Alert, Link, Button, Form, colors } from "@trustee/ui";
import { PasswordField } from "@/components/auth/PasswordField";
import { authApi } from "@/lib/api";
import {
  resetPasswordSchema,
  type ResetPasswordFormData,
} from "@/lib/validations/auth";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  if (!token) {
    return (
      <Box textAlign="center">
        <Typography variant="h3" sx={{ mb: 1 }}>
          유효하지 않은 링크
        </Typography>
        <Typography variant="body2" sx={{ color: colors.fg.tertiary, mb: 3 }}>
          비밀번호 재설정 링크가 유효하지 않거나 만료되었습니다.
        </Typography>
        <Link
          component={NextLink}
          href="/forgot-password"
          underline="hover"
          sx={{ color: colors.link.primary, "&:hover": { color: colors.link.hover } }}
        >
          비밀번호 찾기 다시 요청
        </Link>
      </Box>
    );
  }

  const onSubmit = async (data: ResetPasswordFormData) => {
    setError(null);
    try {
      await authApi.resetPassword({ token, password: data.password });
      router.push("/login?reset=true");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "비밀번호 변경에 실패했습니다. 다시 시도해주세요.",
      );
    }
  };

  return (
    <Box>
      <Typography variant="h3" textAlign="center" sx={{ mb: 0.5 }}>
        비밀번호 재설정
      </Typography>
      <Typography
        variant="body2"
        textAlign="center"
        sx={{ color: colors.fg.tertiary, mb: 3 }}
      >
        새로운 비밀번호를 입력해주세요.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Form onSubmit={handleSubmit(onSubmit)}>
        <PasswordField
          label="새 비밀번호"
          autoComplete="new-password"
          autoFocus
          {...register("password")}
          error={errors.password?.message}
          helperText="8자 이상, 영문자와 숫자를 포함해야 합니다"
        />

        <PasswordField
          label="비밀번호 확인"
          autoComplete="new-password"
          {...register("confirmPassword")}
          error={errors.confirmPassword?.message}
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          loading={isSubmitting}
          sx={{ mt: 2, mb: 2 }}
        >
          비밀번호 변경
        </Button>
      </Form>

      <Typography variant="body2" textAlign="center">
        <Link
          component={NextLink}
          href="/login"
          underline="hover"
          sx={{ color: colors.link.primary, "&:hover": { color: colors.link.hover } }}
        >
          로그인으로 돌아가기
        </Link>
      </Typography>
    </Box>
  );
}
