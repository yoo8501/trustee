"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import NextLink from "next/link";
import { Box, Typography, Alert, Link, Button, Form, FormTextField, colors } from "@trustee/ui";
import { PasswordField } from "@/components/auth/PasswordField";
import { useAuth } from "@/hooks";
import { signupSchema, type SignupFormData } from "@/lib/validations/auth";

export default function SignupPage() {
  const { signup } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormData) => {
    setError(null);
    try {
      await signup({ name: data.name, email: data.email, password: data.password });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "회원가입에 실패했습니다. 다시 시도해주세요.",
      );
    }
  };

  return (
    <Box>
      <Typography variant="h3" textAlign="center" sx={{ mb: 0.5 }}>
        회원가입
      </Typography>
      <Typography
        variant="body2"
        textAlign="center"
        sx={{ color: colors.fg.tertiary, mb: 3 }}
      >
        수탁사 관리 시스템에 가입하세요
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Form onSubmit={handleSubmit(onSubmit)}>
        <FormTextField
          label="이름"
          autoComplete="name"
          autoFocus
          {...register("name")}
          error={errors.name?.message}
        />

        <FormTextField
          label="이메일"
          type="email"
          autoComplete="email"
          {...register("email")}
          error={errors.email?.message}
        />

        <PasswordField
          label="비밀번호"
          autoComplete="new-password"
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
          회원가입
        </Button>
      </Form>

      <Typography variant="body2" textAlign="center">
        이미 계정이 있으신가요?{" "}
        <Link
          component={NextLink}
          href="/login"
          underline="hover"
          sx={{ color: colors.link.primary, "&:hover": { color: colors.link.hover } }}
        >
          로그인
        </Link>
      </Typography>
    </Box>
  );
}
