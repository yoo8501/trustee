import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, type ApiResult } from '../../../lib/api';
import { server } from '../../../test/msw-server';
import { teamsApi } from './client';

function ok<T>(d: T, total?: number): ApiResult<T> {
  return {
    success: true,
    data: d,
    message: 'ok',
    details: null,
    total: total ?? null,
  };
}
function fail(code: string, message = 'fail'): ApiResult<null> {
  return {
    success: false,
    data: null,
    message,
    details: { errorCode: code },
    total: null,
  };
}

const sampleTeam = {
  id: 1,
  name: 'HR',
  parentTeamId: null,
  teamLeadId: 2,
  hrManagerId: 3,
};

describe('teamsApi', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('list — items + total', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/teams/list', () =>
        HttpResponse.json(ok([sampleTeam], 1)),
      ),
    );
    const r = await teamsApi.list();
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe('HR');
  });

  it('create — Team 반환', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/teams', () =>
        HttpResponse.json(ok(sampleTeam), { status: 201 }),
      ),
    );
    const t = await teamsApi.create({ name: 'HR' });
    expect(t.id).toBe(1);
  });

  it('update — Team 반환', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/teams/update', () =>
        HttpResponse.json(ok({ ...sampleTeam, name: 'People' })),
      ),
    );
    const t = await teamsApi.update({ id: 1, name: 'People' });
    expect(t.name).toBe('People');
  });

  it('delete — status ok', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/teams/delete', () =>
        HttpResponse.json(ok({ status: 'ok' })),
      ),
    );
    const r = await teamsApi.delete(1);
    expect(r.status).toBe('ok');
  });

  it('create — FORBIDDEN → ApiError', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/teams', () =>
        HttpResponse.json(fail('FORBIDDEN'), { status: 403 }),
      ),
    );
    const err = await teamsApi
      .create({ name: 'X' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
  });
});
