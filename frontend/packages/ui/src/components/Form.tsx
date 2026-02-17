"use client";

import TextField, { TextFieldProps } from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import InputLabel from "@mui/material/InputLabel";
import Select, { SelectProps } from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import MuiCheckbox from "@mui/material/Checkbox";
import MuiRadio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import { ReactNode } from "react";

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
      size="small"
    />
  );
}

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
    <FormControl fullWidth margin="normal" error={!!error} size="small">
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

// FormCheckbox
export interface FormCheckboxProps {
  label: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  error?: string;
}

export function FormCheckbox({
  label,
  checked,
  onChange,
  disabled,
  error,
}: FormCheckboxProps) {
  return (
    <FormControl error={!!error} margin="normal">
      <FormControlLabel
        control={
          <MuiCheckbox
            checked={checked}
            onChange={(_, val) => onChange?.(val)}
            disabled={disabled}
          />
        }
        label={label}
      />
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  );
}

// FormRadioGroup
export interface FormRadioOption {
  value: string;
  label: string;
}

export interface FormRadioGroupProps {
  label: string;
  name?: string;
  options: FormRadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  row?: boolean;
  error?: string;
}

export function FormRadioGroup({
  label,
  name,
  options,
  value,
  onChange,
  row = false,
  error,
}: FormRadioGroupProps) {
  return (
    <FormControl error={!!error} margin="normal">
      <FormLabel sx={{ fontSize: "0.8125rem", mb: 0.5 }}>{label}</FormLabel>
      <RadioGroup
        name={name}
        value={value}
        onChange={(_, val) => onChange?.(val)}
        row={row}
      >
        {options.map((opt) => (
          <FormControlLabel
            key={opt.value}
            value={opt.value}
            control={<MuiRadio />}
            label={opt.label}
          />
        ))}
      </RadioGroup>
      {error && <FormHelperText>{error}</FormHelperText>}
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
