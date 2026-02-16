"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import GoogleIcon from "@mui/icons-material/Google";
import GitHubIcon from "@mui/icons-material/GitHub";

export function SocialLoginButtons() {
  const handleGoogleLogin = () => {
    // TODO: Google OAuth 연동 후 구현
  };

  const handleGithubLogin = () => {
    // TODO: GitHub OAuth 연동 후 구현
  };

  return (
    <Stack spacing={2}>
      <Divider>
        <Typography variant="body2" color="text.secondary">
          또는
        </Typography>
      </Divider>

      <Button
        variant="outlined"
        fullWidth
        startIcon={<GoogleIcon />}
        onClick={handleGoogleLogin}
        sx={{
          textTransform: "none",
          borderColor: "#dadce0",
          color: "#3c4043",
          "&:hover": { borderColor: "#d2e3fc", backgroundColor: "#f8f9fa" },
        }}
      >
        Google로 계속하기
      </Button>

      <Button
        variant="outlined"
        fullWidth
        startIcon={<GitHubIcon />}
        onClick={handleGithubLogin}
        sx={{
          textTransform: "none",
          borderColor: "#d0d7de",
          color: "#24292f",
          "&:hover": { borderColor: "#1f2328", backgroundColor: "#f6f8fa" },
        }}
      >
        GitHub로 계속하기
      </Button>
    </Stack>
  );
}
