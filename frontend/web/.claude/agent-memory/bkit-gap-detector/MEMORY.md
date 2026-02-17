# Gap Detector Agent Memory

## Project Context
- Monorepo: trustee/ with frontend/web (Next.js 15) and @trustee/ui package
- @trustee/ui re-exports MUI components + custom components (Button, Form, DataTable, Dialog, etc.)
- Design tokens: `colors`, `typography`, `radius` from `@trustee/ui` theme/tokens

## Analysis History

### login-design-system (2026-02-17)
- Match Rate: 97.7% (43/44 items)
- 7 files analyzed across auth pages
- Single gap: layout.tsx omitted unused Typography import (intentional, lint-clean)
- All hardcoded colors removed, all tokens applied correctly
- Report: docs/03-analysis/login-design-system.analysis.md

## Key Patterns
- @trustee/ui index.ts re-exports: Box, Container, Stack, Grid, Paper, Card, Typography, Chip, Avatar, Divider, Alert, Link, etc.
- MUI icons (@mui/icons-material) are NOT re-exported - direct import is expected
- InputAdornment is NOT re-exported - direct MUI import is expected
- Custom components: Button (loading), IconButton, FormCheckbox, FormTextField, FormSelect, etc.
- Design token usage: colors.bg.*, colors.fg.*, colors.border.*, colors.link.*
