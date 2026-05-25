import { describe, expect, it } from 'vitest';
import { LoginSchema, RegisterSchema } from './schemas';

describe('LoginSchema', () => {
  it('정상 입력은 통과한다', () => {
    const out = LoginSchema.safeParse({
      email: 'a@b.com',
      password: 'pw12345!',
    });
    expect(out.success).toBe(true);
  });

  it('이메일 누락은 reason=required 로 실패', () => {
    const out = LoginSchema.safeParse({ email: '', password: 'pw12345!' });
    expect(out.success).toBe(false);
    if (!out.success) {
      const issue = out.error.issues.find((i) => i.path[0] === 'email');
      expect(issue?.message).toBe('required');
    }
  });

  it('이메일 형식 오류는 reason=format 으로 실패', () => {
    const out = LoginSchema.safeParse({
      email: 'not-an-email',
      password: 'pw12345!',
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      const issue = out.error.issues.find((i) => i.path[0] === 'email');
      expect(issue?.message).toBe('format');
    }
  });

  it('비밀번호 짧음은 reason=min 으로 실패', () => {
    const out = LoginSchema.safeParse({
      email: 'a@b.com',
      password: 'short',
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      const issue = out.error.issues.find((i) => i.path[0] === 'password');
      expect(issue?.message).toBe('min');
    }
  });
});

describe('RegisterSchema', () => {
  it('정상 입력 통과', () => {
    const out = RegisterSchema.safeParse({
      name: '홍길동',
      email: 'a@b.com',
      password: 'pw12345!',
    });
    expect(out.success).toBe(true);
  });

  it('이름 누락 → required', () => {
    const out = RegisterSchema.safeParse({
      name: '   ',
      email: 'a@b.com',
      password: 'pw12345!',
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      const issue = out.error.issues.find((i) => i.path[0] === 'name');
      expect(issue?.message).toBe('required');
    }
  });

  it('이메일 형식 오류 → format', () => {
    const out = RegisterSchema.safeParse({
      name: '홍길동',
      email: 'bad',
      password: 'pw12345!',
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      const issue = out.error.issues.find((i) => i.path[0] === 'email');
      expect(issue?.message).toBe('format');
    }
  });

  it('비밀번호 < 8자 → min', () => {
    const out = RegisterSchema.safeParse({
      name: '홍길동',
      email: 'a@b.com',
      password: '1234',
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      const issue = out.error.issues.find((i) => i.path[0] === 'password');
      expect(issue?.message).toBe('min');
    }
  });
});
