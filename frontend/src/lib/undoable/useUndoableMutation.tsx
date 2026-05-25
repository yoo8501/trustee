import Button from '@mui/material/Button';
import { useSnackbar, type SnackbarKey } from 'notistack';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * useUndoableMutation — 5초 Undo 패턴 (DocFlow UX §2 실수 복구).
 *
 * 동작:
 *  1. trigger() 호출 즉시 info snackbar 노출 + Undo 버튼.
 *  2. delayMs (기본 5000ms) 안에 Undo 클릭하면 mutation 호출 안 함.
 *  3. delayMs 후 Undo 안 됐으면 mutationFn() 실행 → 성공 toast / 실패 toast.
 *
 * 사용 예: 휴가 신청 취소 — 사용자가 실수로 눌렀을 가능성 대비.
 *
 * 호스트 환경: notistack `<SnackbarProvider>` 가 트리 위에 있어야 한다.
 */

export interface UndoableMutationOptions<T> {
  /** 5초 후 실제로 실행할 mutation. */
  mutationFn: () => Promise<T>;
  /** Undo 가능한 snackbar 메시지 (예: "휴가 신청 취소 — 5초 안 되돌리기 가능"). */
  undoMessage: string;
  /** mutation 성공 시 표시할 메시지. */
  successMessage: string;
  /** mutation 실패 시 표시할 메시지. 지정하지 않으면 `common.error` i18n key 사용. */
  errorMessage?: string;
  /** Undo 가능 시간 (ms). 기본 5000. */
  delayMs?: number;
  /** mutation 성공 후 호출 (cache invalidate 등). */
  onSuccess?: (data: T) => void;
  /** mutation 실패 후 호출. */
  onError?: (err: unknown) => void;
}

export interface UndoableMutationResult {
  /** Undo 가능한 mutation 시작 — snackbar 노출. */
  trigger: () => void;
  /** 현재 보류 중인 mutation 이 있으면 즉시 취소 (테스트/언마운트 용). */
  cancel: () => void;
  /** 현재 보류 중인지 (snackbar 가 떠있고 timer 가 도는 중). */
  isPending: () => boolean;
}

export function useUndoableMutation<T>(
  opts: UndoableMutationOptions<T>,
): UndoableMutationResult {
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const { t } = useTranslation();

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoneRef = useRef<boolean>(false);
  const snackKeyRef = useRef<SnackbarKey | null>(null);
  const optsRef = useRef(opts);

  // opts 가 매 렌더 변할 수 있어 ref 로 최신값 추적
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  const cancel = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (snackKeyRef.current !== null) {
      closeSnackbar(snackKeyRef.current);
      snackKeyRef.current = null;
    }
    undoneRef.current = true;
  }, [closeSnackbar]);

  // 언마운트 시 보류 mutation 취소 (snackbar 가 사라져도 fire-and-forget 안 함)
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const trigger = useCallback(() => {
    // 이전 trigger 가 아직 보류 중이면 새 trigger 가 그 결과를 덮어쓰기 전에 정리
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
    }
    undoneRef.current = false;

    const delay = optsRef.current.delayMs ?? 5000;

    const key = enqueueSnackbar(optsRef.current.undoMessage, {
      variant: 'info',
      autoHideDuration: delay,
      action: (snackKey: SnackbarKey) => (
        <Button
          color="inherit"
          size="small"
          data-testid="undoable-undo-button"
          onClick={() => {
            undoneRef.current = true;
            if (timeoutRef.current !== null) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            closeSnackbar(snackKey);
            snackKeyRef.current = null;
          }}
        >
          {t('common.undo')}
        </Button>
      ),
    });
    snackKeyRef.current = key;

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      snackKeyRef.current = null;
      if (undoneRef.current) return;
      const current = optsRef.current;
      void (async () => {
        try {
          const result = await current.mutationFn();
          enqueueSnackbar(current.successMessage, { variant: 'success' });
          current.onSuccess?.(result);
        } catch (err) {
          enqueueSnackbar(
            current.errorMessage ?? t('common.error'),
            { variant: 'error' },
          );
          current.onError?.(err);
        }
      })();
    }, delay);
  }, [closeSnackbar, enqueueSnackbar, t]);

  const isPending = useCallback(
    () => timeoutRef.current !== null,
    [],
  );

  return { trigger, cancel, isPending };
}
