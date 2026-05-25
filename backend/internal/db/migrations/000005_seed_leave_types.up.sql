-- Sprint 3: 휴가 종류 기본 시드 (tenant_id=1).
--
-- 연차/월차 분리:
--   - 'annual'        — 1년 이상 근속자 anniversary 적립 (15일 + 근속 가산, 최대 25일)
--   - 'monthly_annual'— 1년 미만 근속자 월 1일 적립
-- 두 종류를 별도 row 로 두면 leave_balances UNIQUE (user_id, leave_type_id, period_year)
-- 가 자연스럽게 1년차 cutover 를 분리해 준다.
--
-- ON CONFLICT 로 idempotent — migration 재실행 시 중복 INSERT 방지.

INSERT INTO leave_types (tenant_id, code, name, default_hours, accrual_policy, is_paid) VALUES
(1, 'annual', '연차', 8.0,
   '{"type":"annual_hire_anniversary","base_days":15,"tenure_bonus_per_2y":1,"tenure_cap_days":25,"expires_after_months":12,"carryover_max_days":0}'::jsonb,
   TRUE),
(1, 'monthly_annual', '월차(1년 미만)', 8.0,
   '{"type":"monthly_lt_one_year","base_days":1,"expires_after_months":12,"carryover_max_days":0}'::jsonb,
   TRUE),
(1, 'half_day', '반차', 4.0,
   '{"type":"fixed"}'::jsonb,
   TRUE),
(1, 'quarter_day', '반반차', 2.0,
   '{"type":"fixed"}'::jsonb,
   TRUE),
(1, 'public', '공가', 8.0,
   '{"type":"fixed"}'::jsonb,
   TRUE),
(1, 'comp_leave', '보상휴가', 8.0,
   '{"type":"carryover_from_overtime","expires_after_months":12,"carryover_max_days":0}'::jsonb,
   TRUE),
(1, 'special', '특별휴가', 8.0,
   '{"type":"fixed"}'::jsonb,
   TRUE)
ON CONFLICT (tenant_id, code) DO NOTHING;
