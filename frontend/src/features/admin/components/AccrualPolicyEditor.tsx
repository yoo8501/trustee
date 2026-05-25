import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccrualPolicySchema, type AccrualPolicy } from '../schemas';

interface Props {
  value: AccrualPolicy;
  onChange: (next: AccrualPolicy) => void;
  /** 부모 form 측의 에러 표시 트리거. */
  onValidityChange?: (valid: boolean) => void;
}

/**
 * AccrualPolicyEditor — JSON Textarea + Zod 검증.
 *
 * - 사용자가 입력한 텍스트는 raw state 로 유지.
 * - blur 시 (또는 매 변경 시) JSON parse → Zod parse 시도.
 *   실패 시 i18n 키로 helperText 표시 + 부모 form 의 저장 버튼이 비활성.
 * - 성공 시 onChange(parsed) 호출.
 *
 * 잘못된 JSON 은 저장을 차단한다 (Done When §3).
 */
export function AccrualPolicyEditor({ value, onChange, onValidityChange }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    // 외부 value 가 바뀐 경우 (예: 다른 휴가 type 선택 시 reset) 동기화
    setText(JSON.stringify(value, null, 2));
  }, [value]);

  const validateAndPropagate = (raw: string) => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      setErrorKey('admin.leaveTypes.accrualPolicy.invalidJson');
      onValidityChange?.(false);
      return;
    }
    const result = AccrualPolicySchema.safeParse(parsedJson);
    if (!result.success) {
      setErrorKey('admin.leaveTypes.accrualPolicy.invalidSchema');
      onValidityChange?.(false);
      return;
    }
    setErrorKey(null);
    onValidityChange?.(true);
    onChange(result.data);
  };

  return (
    <TextField
      multiline
      rows={8}
      fullWidth
      label={t('admin.leaveTypes.accrualPolicy')}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => validateAndPropagate(text)}
      error={!!errorKey}
      helperText={errorKey ? t(errorKey) : ' '}
      slotProps={{
        htmlInput: {
          'data-testid': 'accrual-policy-textarea',
          spellCheck: 'false',
          style: { fontFamily: 'monospace' },
        },
      }}
    />
  );
}
