// Comunicação com o servidor.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

// Na prévia (modo demonstração) as chamadas são respondidas no próprio navegador.
let demoHandler = null;
export function useDemo(handler) { demoHandler = handler; }

export async function api(method, path, body) {
  if (demoHandler) {
    const { status, data } = await demoHandler(method, path, body);
    if (status >= 400) throw new ApiError(data?.error || `Erro ${status}`, status);
    return data;
  }
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Confira sua internet.', 0);
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* resposta sem JSON */ }
  if (res.headers.get('x-offline-cache')) data = { ...data, _offline: true };
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(data?.error || `Erro ${res.status}`, res.status);
  }
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const put = (p, b) => api('PUT', p, b);
export const patch = (p, b) => api('PATCH', p, b);
export const del = (p) => api('DELETE', p);

/** Baixa um arquivo da API (CSV/backup) mantendo o login. */
export async function download(path) {
  if (demoHandler) throw new ApiError('Na prévia não dá para baixar arquivos. No app instalado funciona.', 400);
  const res = await fetch('/api' + path, { credentials: 'same-origin' });
  if (!res.ok) throw new ApiError('Não foi possível baixar o arquivo.', res.status);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'arquivo';
  return { blob: await res.blob(), name };
}
