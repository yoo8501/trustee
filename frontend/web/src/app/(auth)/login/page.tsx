"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import NextLink from "next/link";
import { Button, Form, FormTextField } from "@trustee/ui";
import { PasswordField } from "@/components/auth/PasswordField";
import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";
import { useAuth } from "@/hooks";
import { loginSchema, type LoginFormData } from "@/lib/validations/auth";

export default function LoginPage() {
  const router = useRouter();
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
      <Typography variant="h5" fontWeight={700} textAlign="center" gutterBottom>
        수탁사 관리 시스템
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        textAlign="center"
        sx={{ mb: 3 }}
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
          <FormControlLabel
            control={<Checkbox size="small" />}
            label={
              <Typography variant="body2">로그인 상태 유지</Typography>
            }
          />
          <MuiLink
            component={NextLink}
            href="/forgot-password"
            variant="body2"
            underline="hover"
          >
            비밀번호를 잊으셨나요?
          </MuiLink>
        </Stack>

        <Button
          type="submit"
          variant="contained"
          fullWidth
          loading={isSubmitting}
          sx={{ mt: 1, mb: 2, py: 1.2 }}
        >
          로그인
        </Button>
      </Form>

      <SocialLoginButtons />

      <Typography variant="body2" textAlign="center" sx={{ mt: 3 }}>
        계정이 없으신가요?{" "}
        <MuiLink component={NextLink} href="/signup" underline="hover">
          회원가입
        </MuiLink>
      </Typography>
    </Box>
  );
}
