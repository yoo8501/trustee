"use client";

import { useState, useEffect } from "react";
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

const SAVED_EMAIL_COOKIE = "trustee_saved_email";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30일 (초)

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [rememberEmail, setRememberEmail] = useState(false);

  const registered = searchParams.get("registered") === "true";

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    const savedEmail = getCookie(SAVED_EMAIL_COOKIE);
    if (savedEmail) {
      setValue("email", savedEmail);
      setRememberEmail(true);
    }
  }, [setValue]);

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    try {
      await login(data);
      if (rememberEmail) {
        setCookie(SAVED_EMAIL_COOKIE, data.email, COOKIE_MAX_AGE);
      } else {
        deleteCookie(SAVED_EMAIL_COOKIE);
      }
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
          <FormCheckbox
            label="이메일 저장"
            checked={rememberEmail}
            onChange={setRememberEmail}
          />
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
