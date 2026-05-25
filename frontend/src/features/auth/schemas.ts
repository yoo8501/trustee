import { z } from 'zod';

/**
 * 로그인 폼 입력. BE `POST /api/auth/login` 의 request body 와 일치.
 *
 * - email: 비어있지 않은 이메일 형식.
 * - password: 8자 이상.
 *
 * 검증 사유 (reason) 는 `error.field.<field>.<reason>` i18n 키로 매핑된다.
 * (UX 9원칙 §3 — 폼 단계에서 차단, 비활성 버튼 + inline 사유.)
 */
export const LoginSchema = z.object({
  email: z
    .string()
    .min(1, { message: 'required' })
    .email({ message: 'format' }),
  password: z.string().min(8, { message: 'min' }),
});

export type LoginInput = z.infer<typeof LoginSchema>;

/**
 * 회원가입 폼 입력. BE `POST /api/auth/register` 의 request body 와 일치.
 *
 * - name: 1자 이상.
 * - email: 이메일 형식.
 * - password: 8자 이상. (BE 와 동일 — 강도 정책은 P4 이후.)
 */
export const RegisterSchema = z.object({
  name: z.string().trim().min(1, { message: 'required' }),
  email: z
    .string()
    .min(1, { message: 'required' })
    .email({ message: 'format' }),
  password: z.string().min(8, { message: 'min' }),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
