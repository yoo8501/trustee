"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import NextLink from "next/link";
import {
  Box, Stack, Typography, Alert, Link,
  Button, Form, FormTextField, FormCheckbox, colors,
} from "@trustee/ui";
import { PasswordField } from "@/components/auth/PasswordField";
import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";
import { useAuth } from "@/hooks";
import { loginSchema, type LoginFormData } from "@/lib/validations/auth";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const registered = searchParams.get("registered") === "true";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    try {
      await login(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "로그인에 실패했습니다. 다시 시도해주세요.",
      );
    }
  };

  return (
    <Box>
      <Typography variant="h3" textAlign="center" sx={{ mb: 0.5 }}>
        수탁사 관리 시스템
      </Typography>
      <Typography
        variant="body2"
        textAlign="center"
        sx={{ color: colors.fg.tertiary, mb: 3 }}
      >
        계정에 로그인하세요
      </Typography>

      {registered && (
        <Alert severity="success" sx={{ mb: 2 }}>
          회원가입이 완료되었습니다. 로그인해주세요.
        </Alert>
      )}

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

        <PasswordField
          label="비밀번호"
          autoComplete="current-password"
          {...register("password")}
          error={errors.password?.message}
        />

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mt: 1, mb: 1 }}
        >
          <FormCheckbox label="로그인 상태 유지" />
          <Link
            component={NextLink}
            href="/forgot-password"
            variant="body2"
            underline="hover"
            sx={{ color: colors.link.primary, "&:hover": { color: colors.link.hover } }}
          >
            비밀번호를 잊으셨나요?
          </Link>
        </Stack>

        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          loading={isSubmitting}
          sx={{ mt: 1, mb: 2 }}
        >
          로그인
        </Button>
      </Form>

      <SocialLoginButtons />

      <Typography variant="body2" textAlign="center" sx={{ mt: 3 }}>
        계정이 없으신가요?{" "}
        <Link
          component={NextLink}
          href="/signup"
          underline="hover"
          sx={{ color: colors.link.primary, "&:hover": { color: colors.link.hover } }}
        >
          회원가입
        </Link>
      </Typography>
    </Box>
  );
}
