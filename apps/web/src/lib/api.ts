const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') ?? '/api';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function getErrorMessage(responseText: string, status: number): string {
  if (responseText.trim()) {
    try {
      const body: unknown = JSON.parse(responseText);
      if (body && typeof body === 'object' && 'message' in body) {
        const message = body.message;
        if (Array.isArray(message)) {
          return message.join(', ');
        }
        if (typeof message === 'string' && message.trim()) {
          return message;
        }
      }
    } catch {
      // A plain-text backend error can still be useful to the caller.
    }

    const plainText = responseText.trim();
    if (!/^\s*</.test(plainText)) {
      return plainText.slice(0, 500);
    }
  }

  return `Request failed with status ${status}. Please try again.`;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const maxRetries = method === 'GET' ? 2 : 0;
  let response: Response;

  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...(options.body && !(typeof FormData !== 'undefined' && options.body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...options.headers,
        },
      });
    } catch (error) {
      const wasAborted = error instanceof Error && error.name === 'AbortError';
      if (wasAborted) {
        throw error;
      }

      if (error instanceof TypeError && attempt < maxRetries && !options.signal?.aborted) {
        await wait(250 * 2 ** attempt);
        continue;
      }

      console.error('[API] Request could not reach the server.', {
        method,
        path,
        error,
      });
      throw new ApiRequestError(
        'Unable to connect to the server. Check your connection and try again.',
        null,
      );
    }

    if (
      !response.ok &&
      method === 'GET' &&
      isRetryableStatus(response.status) &&
      attempt < maxRetries &&
      !options.signal?.aborted
    ) {
      await wait(250 * 2 ** attempt);
      continue;
    }

    break;
  }

  const responseText = await response.text();

  if (!response.ok) {
    const message = getErrorMessage(responseText, response.status);
    console.error('[API] Backend request failed.', {
      method,
      path,
      status: response.status,
      message,
      responseBody: responseText,
    });
    throw new ApiRequestError(message, response.status);
  }

  if (!responseText.trim()) {
    return undefined as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch (error) {
    console.error('[API] Server returned an invalid JSON response.', {
      method,
      path,
      status: response.status,
      responseBody: responseText,
      error,
    });
    throw new ApiRequestError(
      'The server returned an invalid response. Please try again.',
      response.status,
    );
  }
}

export async function apiDownload(path: string, options: RequestInit = {}): Promise<Blob> {
  const method = (options.method ?? 'GET').toUpperCase();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: '*/*',
        ...options.headers,
      },
    });
  } catch (error) {
    console.error('[API] Download request could not reach the server.', {
      method,
      path,
      error,
    });
    throw new ApiRequestError(
      'Unable to connect to the server. Check your connection and try again.',
      null,
    );
  }
  if (!response.ok) {
    const responseText = await response.text();
    const message = getErrorMessage(responseText, response.status);
    console.error('[API] Backend download request failed.', {
      method,
      path,
      status: response.status,
      message,
      responseBody: responseText,
    });
    throw new ApiRequestError(message, response.status);
  }
  return response.blob();
}
