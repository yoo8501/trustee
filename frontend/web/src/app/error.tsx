"use client";

import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: 2,
        textAlign: "center",
        p: 4,
      }}
    >
      <Typography variant="h5" color="text.primary">
        문제가 발생했습니다
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {error.message || "페이지를 불러오는 중 오류가 발생했습니다."}
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <MuiButton variant="contained" onClick={reset}>
          다시 시도
        </MuiButton>
        <MuiButton variant="outlined" href="/">
          홈으로
        </MuiButton>
      </Box>
    </Box>
  );
}
