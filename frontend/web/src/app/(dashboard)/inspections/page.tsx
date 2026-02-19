"use client";

import { useRouter } from "next/navigation";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActionArea from "@mui/material/CardActionArea";
import ListAltIcon from "@mui/icons-material/ListAlt";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import { PageHeader, Box } from "@trustee/ui";
import { spacing } from "@trustee/ui";

export default function InspectionsPage() {
  const router = useRouter();

  return (
    <Box sx={{ p: `${spacing.pageInset}px` }}>
      <PageHeader
        title="점검 관리"
        description="보안점검 체크리스트 템플릿과 수탁사별 체크리스트를 관리합니다."
      />

      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        <Card sx={{ flex: "1 1 300px", maxWidth: 400 }}>
          <CardActionArea onClick={() => router.push("/inspections/templates")}>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, p: 3 }}>
              <ListAltIcon sx={{ fontSize: 40, color: "primary.main" }} />
              <Box>
                <Typography variant="h6">체크리스트 템플릿</Typography>
                <Typography variant="body2" color="text.secondary">
                  Root 템플릿을 관리합니다. JSON Import로 생성할 수 있습니다.
                </Typography>
              </Box>
            </CardContent>
          </CardActionArea>
        </Card>

        <Card sx={{ flex: "1 1 300px", maxWidth: 400 }}>
          <CardActionArea onClick={() => router.push("/inspections/checklists")}>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, p: 3 }}>
              <AssignmentTurnedInIcon sx={{ fontSize: 40, color: "success.main" }} />
              <Box>
                <Typography variant="h6">수탁사 체크리스트</Typography>
                <Typography variant="body2" color="text.secondary">
                  수탁사에게 전달할 보안점검 체크리스트를 생성하고 관리합니다.
                </Typography>
              </Box>
            </CardContent>
          </CardActionArea>
        </Card>
      </Box>
    </Box>
  );
}
