import { sendPushNotification } from './webpush.js';

export interface Env {
  WEBPUSH_SUBSCRIPTIONS: KVNamespace;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  NOTIFY_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
}

const ALLOWED_ORIGINS = ['https://uoplan.party', 'http://localhost:5173'];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

async function endpointKey(endpoint: string): Promise<string> {
  const data = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sub:${hex}`;
}

async function verifyTurnstile(token: string, secret: string, ip: string): Promise<boolean> {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(ip)}`,
  });
  const data = await res.json<{ success: boolean }>();
  return data.success;
}

async function handleSubscribe(req: Request, env: Env): Promise<Response> {
  const sub = await req.json<{
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    'cf-turnstile-response'?: string;
  }>();
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return json(req, 400, { error: 'Invalid subscription' });
  }
  const token = sub['cf-turnstile-response'];
  if (!token) return json(req, 400, { error: 'Missing Turnstile token' });
  const ip = req.headers.get('CF-Connecting-IP') ?? '';
  if (!(await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, ip))) {
    return json(req, 403, { error: 'Turnstile verification failed' });
  }
  const key = await endpointKey(sub.endpoint);
  const { endpoint, keys } = sub;
  await env.WEBPUSH_SUBSCRIPTIONS.put(key, JSON.stringify({ endpoint, keys }));
  return json(req, 201, { ok: true });
}

async function handleUnsubscribe(req: Request, env: Env): Promise<Response> {
  const body = await req.json<{ endpoint?: string; 'cf-turnstile-response'?: string }>();
  if (!body?.endpoint) {
    return json(req, 400, { error: 'Missing endpoint' });
  }
  const token = body['cf-turnstile-response'];
  if (!token) return json(req, 400, { error: 'Missing Turnstile token' });
  const ip = req.headers.get('CF-Connecting-IP') ?? '';
  if (!(await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, ip))) {
    return json(req, 403, { error: 'Turnstile verification failed' });
  }
  const key = await endpointKey(body.endpoint);
  await env.WEBPUSH_SUBSCRIPTIONS.delete(key);
  return json(req, 200, { ok: true });
}

async function handleSend(req: Request, env: Env): Promise<Response> {
  if (req.headers.get('Authorization') !== `Bearer ${env.NOTIFY_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = await req.json<{ title?: string; body?: string; url?: string }>();
  if (!payload?.title || !payload?.body || !payload?.url) {
    return json(req, 400, { error: 'Missing required fields: title, body, url' });
  }

  const { title, body, url } = payload;

  let sent = 0;
  let failed = 0;
  let cleaned = 0;
  let cursor: string | undefined;
  let listComplete = false;

  while (!listComplete) {
    const list = await env.WEBPUSH_SUBSCRIPTIONS.list({ prefix: 'sub:', cursor });
    cursor = (list as { cursor?: string }).cursor ?? undefined;
    listComplete = list.list_complete;

    await Promise.all(
      list.keys.map(async (kvKey) => {
        const subJson = await env.WEBPUSH_SUBSCRIPTIONS.get(kvKey.name);
        if (!subJson) return;
        const subscription = JSON.parse(subJson);
        try {
          await sendPushNotification(
            subscription,
            JSON.stringify({ title, body, url }),
            env.VAPID_SUBJECT,
            env.VAPID_PUBLIC_KEY,
            env.VAPID_PRIVATE_KEY,
          );
          sent++;
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 410 || status === 404) {
            await env.WEBPUSH_SUBSCRIPTIONS.delete(kvKey.name);
            cleaned++;
          } else {
            failed++;
            console.error('Failed to send notification (status=%s):', status ?? 'unknown', err);
          }
        }
      }),
    );
  }

  return new Response(JSON.stringify({ sent, failed, cleaned }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    if (req.method === 'POST') {
      if (pathname === '/subscribe') return handleSubscribe(req, env);
      if (pathname === '/unsubscribe') return handleUnsubscribe(req, env);
      if (pathname === '/send') return handleSend(req, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};
