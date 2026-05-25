// RED stub — Sprint 1 TDD
export interface HttpClient {
  get<T>(url: string, init?: RequestInit): Promise<T>;
  post<T>(url: string, body?: unknown, init?: RequestInit): Promise<T>;
}

export const http: HttpClient = {
  get: async <T,>(_url: string, _init?: RequestInit): Promise<T> => {
    throw new Error('http.get not implemented');
  },
  post: async <T,>(
    _url: string,
    _body?: unknown,
    _init?: RequestInit,
  ): Promise<T> => {
    throw new Error('http.post not implemented');
  },
};
