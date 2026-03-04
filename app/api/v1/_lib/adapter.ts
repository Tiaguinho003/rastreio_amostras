import { NextRequest, NextResponse } from 'next/server';

import { getBackendApi } from './backend-api';

export type BackendMethodName = keyof ReturnType<typeof getBackendApi>;

function headersToObject(headers: Headers) {
  return Object.fromEntries(headers.entries());
}

function queryToObject(searchParams: URLSearchParams) {
  return Object.fromEntries(searchParams.entries());
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function toNextResponse(result: { status: number; body: unknown }) {
  return NextResponse.json(result.body, { status: result.status });
}

export async function executeBackend(
  methodName: BackendMethodName,
  request: NextRequest,
  options: {
    params?: Record<string, string>;
    body?: unknown;
  } = {}
) {
  const api = getBackendApi();
  const method = api[methodName] as (input: {
    headers: Record<string, string>;
    params: Record<string, string>;
    query: Record<string, string>;
    body: unknown;
  }) => Promise<{ status: number; body: unknown }>;

  const result = await method({
    headers: headersToObject(request.headers),
    params: options.params ?? {},
    query: queryToObject(request.nextUrl.searchParams),
    body: options.body ?? {}
  });

  return toNextResponse(result);
}
