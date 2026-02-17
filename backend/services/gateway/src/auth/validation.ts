import { z } from "zod";

export const signupSchema = z.object({
  name: z
    .string()
    .min(1, "이름은 필수입니다")
    .max(50, "이름은 50자 이하여야 합니다"),
  email: z
    .string()
    .min(1, "이메일은 필수입니다")
    .email("유효한 이메일을 입력해주세요"),
  password: z
    .string()
    .min(8, "비밀번호는 8자 이상이어야 합니다")
    .regex(/[a-zA-Z]/, "영문자를 포함해야 합니다")
    .regex(/[0-9]/, "숫자를 포함해야 합니다"),
});

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "이메일은 필수입니다")
    .email("유효한 이메일을 입력해주세요"),
  password: z
    .string()
    .min(1, "비밀번호는 필수입니다"),
});
