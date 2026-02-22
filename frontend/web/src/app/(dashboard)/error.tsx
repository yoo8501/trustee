"use client";

import Typography from "@mui/material/Typography";
import { Button, Box } from "@trustee/ui";

export default function DashboardError({
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
        minHeight: "50vh",
        gap: 2,
        textAlign: "center",
      }}
    >
      <Typography variant="h5" color="text.primary">
        문제가 발생했습니다
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {error.message || "페이지를 불러오는 중 오류가 발생했습니다."}
      </Typography>
      <Button variant="contained" onClick={reset}>
        다시 시도
      </Button>
    </Box>
  );
}
