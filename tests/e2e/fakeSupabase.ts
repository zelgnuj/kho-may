import type { BrowserContext, Route } from '@playwright/test';

/** Supabase giả trong bộ nhớ, dùng chung cho nhiều "thiết bị" (context) trong một test */
export class FakeSupabase {
  rows = new Map<string, { kind: string; id: string; data: unknown; updated_at: number; deleted: boolean; server_ts: string }>();
  files = new Map<string, { body: Buffer; type: string }>();
  clock = Date.parse('2026-10-09T00:00:00Z');
  user = { id: '11111111-1111-1111-1111-111111111111', email: 'lam@example.com' };
  accounts = new Map<string, string>();
  /** true: tạo tài khoản xong phải xác nhận email (như Supabase mặc định) */
  confirmEmail = false;
  confirmed = new Set<string>();

  private ts() { this.clock += 7; return new Date(this.clock).toISOString(); }

  session() {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
    const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: this.user.id, email: this.user.email, role: 'authenticated', aud: 'authenticated', exp })}.sig`;
    return {
      access_token, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'fake-refresh',
      user: { id: this.user.id, aud: 'authenticated', role: 'authenticated', email: this.user.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-09T00:00:00Z' }
    };
  }

  async attach(ctx: BrowserContext) {
    await ctx.route('https://ejatxebyfupvvhhjptcm.supabase.co/**', (route) => this.handle(route));
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (p === '/auth/v1/signup') {
      const b = req.postDataJSON();
      if (this.accounts.has(b.email)) return json({ ...this.session().user, identities: [] });
      this.accounts.set(b.email, b.password);
      if (this.confirmEmail) return json({ ...this.session().user, identities: [{ id: 'x' }], confirmation_sent_at: new Date().toISOString() });
      this.confirmed.add(b.email);
      return json({ ...this.session(), user: { ...this.session().user, identities: [{ id: 'x' }] } });
    }
    if (p === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const b = req.postDataJSON();
      if (this.accounts.get(b.email) !== b.password) return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      if (!this.confirmed.has(b.email)) return json({ code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, 400);
      return json(this.session());
    }
    if (p.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204 });
    if (p.startsWith('/auth/v1/user')) return json(this.session().user);
    if (p.startsWith('/auth/v1/token')) return json(this.session());

    if (p === '/rest/v1/rpc/sync_push') {
      const { rows } = req.postDataJSON() as { rows: { kind: string; id: string; data: unknown; updated_at: number; deleted?: boolean }[] };
      let n = 0;
      for (const r of rows) {
        const k = `${r.kind}:${r.id}`;
        const cur = this.rows.get(k);
        if (cur && cur.updated_at > r.updated_at) continue;
        this.rows.set(k, { kind: r.kind, id: r.id, data: r.data, updated_at: r.updated_at, deleted: !!r.deleted, server_ts: this.ts() });
        n++;
      }
      return json(n);
    }
    if (p === '/rest/v1/records') {
      const gt = (url.searchParams.get('server_ts') ?? 'gt.1970-01-01T00:00:00Z').slice(3);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1000);
      const all = [...this.rows.values()].filter((r) => r.server_ts > gt).sort((a, b) => a.server_ts.localeCompare(b.server_ts));
      return json(all.slice(offset, offset + limit));
    }
    const obj = p.match(/^\/storage\/v1\/object\/(?:authenticated\/)?photos\/(.+)$/);
    if (obj) {
      const key = decodeURIComponent(obj[1]);
      if (req.method() === 'POST' || req.method() === 'PUT') {
        this.files.set(key, { body: req.postDataBuffer() ?? Buffer.alloc(0), type: req.headers()['content-type'] || 'image/jpeg' });
        return json({ Key: `photos/${key}` });
      }
      if (req.method() === 'GET') {
        const f = this.files.get(key);
        return f ? route.fulfill({ status: 200, contentType: f.type, body: f.body }) : json({ error: 'not found' }, 404);
      }
    }
    if (p === '/storage/v1/object/photos' && req.method() === 'DELETE') {
      for (const k of (req.postDataJSON().prefixes ?? []) as string[]) this.files.delete(k);
      return json([]);
    }
    return json({ error: `fake: chưa hỗ trợ ${req.method()} ${p}` }, 501);
  }
}
