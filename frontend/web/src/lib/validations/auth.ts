import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "이메일을 입력해주세요")
    .email("유효한 이메일 형식이 아닙니다"),
  password: z.string().min(1, "비밀번호를 입력해주세요"),
});

export const signupSchema = z
  .object({
    name: z
      .string()
      .min(1, "이름을 입력해주세요")
      .max(50, "이름은 50자 이하여야 합니다"),
    email: z
      .string()
      .min(1, "이메일을 입력해주세요")
      .email("유효한 이메일 형식이 아닙니다"),
    password: z
      .string()
      .min(8, "비밀번호는 8자 이상이어야 합니다")
      .regex(/[a-zA-Z]/, "영문자를 포함해야 합니다")
      .regex(/[0-9]/, "숫자를 포함해야 합니다"),
    confirmPassword: z.string().min(1, "비밀번호 확인을 입력해주세요"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "이메일을 입력해주세요")
    .email("유효한 이메일 형식이 아닙니다"),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "비밀번호는 8자 이상이어야 합니다")
      .regex(/[a-zA-Z]/, "영문자를 포함해야 합니다")
      .regex(/[0-9]/, "숫자를 포함해야 합니다"),
    confirmPassword: z.string().min(1, "비밀번호 확인을 입력해주세요"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["confirmPassword"],
  });

export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
