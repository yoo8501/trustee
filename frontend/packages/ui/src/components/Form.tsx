"use client";

import TextField, { TextFieldProps } from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import Select, { SelectProps } from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import { ReactNode } from "react";

// FormTextField
export interface FormTextFieldProps extends Omit<TextFieldProps, "error"> {
  error?: string;
}

export function FormTextField({ error, helperText, ...props }: FormTextFieldProps) {
  return (
    <TextField
      {...props}
      error={!!error}
      helperText={error || helperText}
      fullWidth
      variant="outlined"
      margin="normal"
    />
  );
}

// FormSelect
export interface FormSelectOption {
  value: string | number;
  label: string;
}

export interface FormSelectProps extends Omit<SelectProps, "error"> {
  label: string;
  options: FormSelectOption[];
  error?: string;
  helperText?: string;
}

export function FormSelect({
  label,
  options,
  error,
  helperText,
  ...props
}: FormSelectProps) {
  const labelId = `${props.name || "select"}-label`;

  return (
    <FormControl fullWidth margin="normal" error={!!error}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select labelId={labelId} label={label} {...props}>
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      {(error || helperText) && (
        <FormHelperText>{error || helperText}</FormHelperText>
      )}
    </FormControl>
  );
}

// Form wrapper
export interface FormProps {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}

export function Form({ onSubmit, children }: FormProps) {
  return (
    <form onSubmit={onSubmit} noValidate>
      {children}
    </form>
  );
}
