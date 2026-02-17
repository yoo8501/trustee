"use client";

import { Button, Stack, Divider, Typography, colors } from "@trustee/ui";
import GoogleIcon from "@mui/icons-material/Google";
import GitHubIcon from "@mui/icons-material/GitHub";

export function SocialLoginButtons() {
  const handleGoogleLogin = () => {
    // TODO: Google OAuth 연동 후 구현
  };

  const handleGithubLogin = () => {
    // TODO: GitHub OAuth 연동 후 구현
  };

  const socialButtonSx = {
    borderColor: colors.border.secondary,
    color: colors.fg.secondary,
    "&:hover": {
      borderColor: colors.border.tertiary,
      backgroundColor: colors.bg.translucent,
    },
  };

  return (
    <Stack spacing={2}>
      <Divider>
        <Typography variant="body2" sx={{ color: colors.fg.tertiary }}>
          또는
        </Typography>
      </Divider>

      <Button
        variant="outlined"
        fullWidth
        startIcon={<GoogleIcon />}
        onClick={handleGoogleLogin}
        sx={socialButtonSx}
      >
        Google로 계속하기
      </Button>

      <Button
        variant="outlined"
        fullWidth
        startIcon={<GitHubIcon />}
        onClick={handleGithubLogin}
        sx={socialButtonSx}
      >
        GitHub로 계속하기
      </Button>
    </Stack>
  );
}
