import { chromium } from "playwright";

const BASE_URL = "http://localhost:3000";
const SCREENSHOT_DIR = "./test-results";

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const results = [];

  // 1. 로그인 페이지 테스트
  console.log("\n=== 1. 로그인 페이지 테스트 ===");
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-login-page.png`, fullPage: true });

  const loginTitle = await page.textContent("h5");
  console.log(`  제목: ${loginTitle}`);
  results.push({ test: "로그인 페이지 로딩", pass: loginTitle?.includes("수탁사 관리 시스템") });

  const emailInput = await page.locator('input[type="email"]').count();
  const passwordInput = await page.locator('input[type="password"]').count();
  console.log(`  이메일 입력: ${emailInput > 0 ? "OK" : "FAIL"}`);
  console.log(`  비밀번호 입력: ${passwordInput > 0 ? "OK" : "FAIL"}`);
  results.push({ test: "이메일 입력 필드", pass: emailInput > 0 });
  results.push({ test: "비밀번호 입력 필드", pass: passwordInput > 0 });

  const googleBtn = await page.getByText("Google로 계속하기").count();
  const githubBtn = await page.getByText("GitHub로 계속하기").count();
  console.log(`  Google 버튼: ${googleBtn > 0 ? "OK" : "FAIL"}`);
  console.log(`  GitHub 버튼: ${githubBtn > 0 ? "OK" : "FAIL"}`);
  results.push({ test: "Google 소셜 로그인 버튼", pass: googleBtn > 0 });
  results.push({ test: "GitHub 소셜 로그인 버튼", pass: githubBtn > 0 });

  const forgotLink = await page.getByText("비밀번호를 잊으셨나요?").count();
  const signupLink = await page.getByText("회원가입").count();
  console.log(`  비밀번호 찾기 링크: ${forgotLink > 0 ? "OK" : "FAIL"}`);
  console.log(`  회원가입 링크: ${signupLink > 0 ? "OK" : "FAIL"}`);
  results.push({ test: "비밀번호 찾기 링크", pass: forgotLink > 0 });
  results.push({ test: "회원가입 링크", pass: signupLink > 0 });

  // 2. 로그인 폼 유효성 검사 테스트
  console.log("\n=== 2. 로그인 폼 유효성 검사 테스트 ===");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-login-validation.png`, fullPage: true });

  const emailError = await page.getByText("이메일을 입력해주세요").count();
  const pwError = await page.getByText("비밀번호를 입력해주세요").count();
  console.log(`  빈 이메일 에러: ${emailError > 0 ? "OK" : "FAIL"}`);
  console.log(`  빈 비밀번호 에러: ${pwError > 0 ? "OK" : "FAIL"}`);
  results.push({ test: "빈 이메일 유효성 에러", pass: emailError > 0 });
  results.push({ test: "빈 비밀번호 유효성 에러", pass: pwError > 0 });

  // 잘못된 이메일 형식 테스트
  await page.locator('input[type="email"]').fill("invalid-email");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForTimeout(500);

  const invalidEmailError = await page.getByText("유효한 이메일 형식이 아닙니다").count();
  console.log(`  잘못된 이메일 형식 에러: ${invalidEmailError > 0 ? "OK" : "FAIL"}`);
  results.push({ test: "잘못된 이메일 형식 에러", pass: invalidEmailError > 0 });

  // 3. 회원가입 페이지 테스트
  console.log("\n=== 3. 회원가입 페이지 테스트 ===");
  await page.goto(`${BASE_URL}/signup`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-signup-page.png`, fullPage: true });

  const signupTitle = await page.textContent("h5");
  console.log(`  제목: ${signupTitle}`);
  results.push({ test: "회원가입 페이지 로딩", pass: signupTitle?.includes("회원가입") });

  const nameInput = await page.getByLabel("이름").count();
  console.log(`  이름 입력: ${nameInput > 0 ? "OK" : "FAIL"}`);
  results.push({ test: "이름 입력 필드", pass: nameInput > 0 });

  // 회원가입 유효성 검사
  await page.getByRole("button", { name: "회원가입" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-signup-validation.png`, fullPage: true });

  const nameError = await page.getByText("이름을 입력해주세요").count();
  console.log(`  빈 이름 에러: ${nameError > 0 ? "OK" : "FAIL"}`);
  results.push({ test: "빈 이름 유효성 에러", pass: nameError > 0 });

  // 비밀번호 불일치 테스트
  await page.getByLabel("이름").fill("테스트");
  await page.locator('input[type="email"]').fill("test@example.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("test1234a");
  await page.getByLabel("비밀번호 확인").fill("different");
  await page.getByRole("button", { name: "회원가입" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/05-signup-pw-mismatch.png`, fullPage: true });

  const mismatchError = await page.getByText("비밀번호가 일치하지 않습니다").count();
  console.log(`  비밀번호 불일치 에러: ${mismatchError > 0 ? "OK" : "FAIL"}`);
  results.push({ test: "비밀번호 불일치 에러", pass: mismatchError > 0 });

  // 4. 비밀번호 찾기 페이지 테스트
  console.log("\n=== 4. 비밀번호 찾기 페이지 테스트 ===");
  await page.goto(`${BASE_URL}/forgot-password`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-forgot-password.png`, fullPage: true });

  const forgotTitle = await page.textContent("h5");
  console.log(`  제목: ${forgotTitle}`);
  results.push({ test: "비밀번호 찾기 페이지 로딩", pass: forgotTitle?.includes("비밀번호 찾기") });

  const backLink = await page.getByText("로그인으로 돌아가기").count();
  console.log(`  로그인 돌아가기 링크: ${backLink > 0 ? "OK" : "FAIL"}`);
  results.push({ test: "로그인 돌아가기 링크", pass: backLink > 0 });

  // 5. 비밀번호 재설정 페이지 (토큰 없음)
  console.log("\n=== 5. 비밀번호 재설정 페이지 테스트 (토큰 없음) ===");
  await page.goto(`${BASE_URL}/reset-password`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-reset-password-no-token.png`, fullPage: true });

  const invalidLink = await page.getByText("유효하지 않은 링크").count();
  console.log(`  토큰 없음 메시지: ${invalidLink > 0 ? "OK" : "FAIL"}`);
  results.push({ test: "토큰 없는 재설정 페이지 에러 표시", pass: invalidLink > 0 });

  // 6. 비밀번호 재설정 페이지 (토큰 있음)
  console.log("\n=== 6. 비밀번호 재설정 페이지 테스트 (토큰 있음) ===");
  await page.goto(`${BASE_URL}/reset-password?token=test-token`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/08-reset-password-with-token.png`, fullPage: true });

  const resetTitle = await page.textContent("h5");
  console.log(`  제목: ${resetTitle}`);
  results.push({ test: "비밀번호 재설정 페이지 로딩", pass: resetTitle?.includes("비밀번호 재설정") });

  // 7. 네비게이션 테스트
  console.log("\n=== 7. 네비게이션 테스트 ===");
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "회원가입" }).click();
  await page.waitForURL("**/signup");
  const navToSignup = page.url().includes("/signup");
  console.log(`  로그인→회원가입 이동: ${navToSignup ? "OK" : "FAIL"}`);
  results.push({ test: "로그인→회원가입 네비게이션", pass: navToSignup });

  await page.getByRole("link", { name: "로그인" }).click();
  await page.waitForURL("**/login");
  const navToLogin = page.url().includes("/login");
  console.log(`  회원가입→로그인 이동: ${navToLogin ? "OK" : "FAIL"}`);
  results.push({ test: "회원가입→로그인 네비게이션", pass: navToLogin });

  // 결과 요약
  console.log("\n========================================");
  console.log("  테스트 결과 요약");
  console.log("========================================");
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`  PASS: ${passed} / ${results.length}`);
  console.log(`  FAIL: ${failed} / ${results.length}`);
  if (failed > 0) {
    console.log("\n  실패 항목:");
    results.filter((r) => !r.pass).forEach((r) => console.log(`    - ${r.test}`));
  }
  console.log("========================================\n");

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

test().catch((e) => {
  console.error("Test error:", e.message);
  process.exit(1);
});
