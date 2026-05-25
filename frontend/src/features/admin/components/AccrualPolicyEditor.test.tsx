import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../lib/i18n';
import type { AccrualPolicy } from '../schemas';
import { AccrualPolicyEditor } from './AccrualPolicyEditor';

function renderEditor(
  value: AccrualPolicy,
  onChange: (next: AccrualPolicy) => void,
  onValidityChange?: (v: boolean) => void,
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <AccrualPolicyEditor
        value={value}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    </I18nextProvider>,
  );
}

describe('AccrualPolicyEditor', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
  });

  it('초기 value 를 JSON 으로 표시', () => {
    renderEditor({ type: 'fixed' }, vi.fn());
    const ta = screen.getByTestId('accrual-policy-textarea') as HTMLTextAreaElement;
    expect(ta.value).toContain('"type"');
    expect(ta.value).toContain('"fixed"');
  });

  it('잘못된 JSON 입력 후 blur → invalidJson helperText + onValidity=false', async () => {
    const onChange = vi.fn();
    const onValidity = vi.fn();
    renderEditor({ type: 'fixed' }, onChange, onValidity);
    const ta = screen.getByTestId('accrual-policy-textarea');
    const user = userEvent.setup();
    await user.clear(ta);
    await user.click(ta);
    await user.paste('{ not valid json');
    ta.blur();
    await waitFor(() =>
      expect(
        screen.getByText('JSON 형식이 올바르지 않아요'),
      ).toBeInTheDocument(),
    );
    expect(onValidity).toHaveBeenLastCalledWith(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('JSON 은 OK 인데 Zod schema 실패 → invalidSchema helperText', async () => {
    const onChange = vi.fn();
    const onValidity = vi.fn();
    renderEditor({ type: 'fixed' }, onChange, onValidity);
    const ta = screen.getByTestId('accrual-policy-textarea');
    const user = userEvent.setup();
    await user.clear(ta);
    // type 누락 → schema 실패
    await user.click(ta);
    await user.paste('{"foo": "bar"}');
    ta.blur();
    await waitFor(() =>
      expect(
        screen.getByText('정책 스키마가 올바르지 않아요'),
      ).toBeInTheDocument(),
    );
    expect(onValidity).toHaveBeenLastCalledWith(false);
  });

  it('정상 schema → onChange(parsed) + onValidity=true', async () => {
    const onChange = vi.fn();
    const onValidity = vi.fn();
    renderEditor({ type: 'fixed' }, onChange, onValidity);
    const ta = screen.getByTestId('accrual-policy-textarea');
    const user = userEvent.setup();
    await user.clear(ta);
    await user.click(ta);
    await user.paste(
      '{"type":"annual_hire_anniversary","base_days":15,"tenure_cap_days":25}',
    );
    ta.blur();
    await waitFor(() => expect(onValidity).toHaveBeenLastCalledWith(true));
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'annual_hire_anniversary',
      base_days: 15,
      tenure_cap_days: 25,
    });
  });
});
