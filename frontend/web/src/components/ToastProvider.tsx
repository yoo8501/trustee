"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

type ToastSeverity = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  message: string;
  severity: ToastSeverity;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, severity: ToastSeverity) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, severity }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (message: string) => addToast(message, "success"),
    error: (message: string) => addToast(message, "error"),
    warning: (message: string) => addToast(message, "warning"),
    info: (message: string) => addToast(message, "info"),
  };

  const current = toasts[0];

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Snackbar
        open={!!current}
        autoHideDuration={5000}
        onClose={() => current && removeToast(current.id)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {current ? (
          <Alert
            onClose={() => removeToast(current.id)}
            severity={current.severity}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context.toast;
}
