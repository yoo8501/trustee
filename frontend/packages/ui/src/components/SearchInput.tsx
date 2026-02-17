"use client";

import InputBase from "@mui/material/InputBase";
import Box from "@mui/material/Box";
import SearchIcon from "@mui/icons-material/Search";
import { colors, radius } from "../theme/tokens";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "검색...",
}: SearchInputProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        height: 32,
        borderRadius: radius[6],
        border: `1px solid ${colors.border.primary}`,
        backgroundColor: colors.bg.level1,
        transition: "border-color 0.15s",
        "&:focus-within": {
          borderColor: colors.brand.indigo,
        },
      }}
    >
      <SearchIcon sx={{ fontSize: 16, color: colors.fg.quaternary }} />
      <InputBase
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        sx={{
          flex: 1,
          fontSize: "0.8125rem",
          color: colors.fg.primary,
          "& input::placeholder": {
            color: colors.fg.quaternary,
            opacity: 1,
          },
        }}
      />
    </Box>
  );
}
