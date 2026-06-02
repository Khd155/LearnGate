// Cloudflare Pages Function — handles all /api/* routes
// Requires D1 binding named "DB" in wrangler.toml

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ok  = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: CORS });
const err = (msg,  status = 400) => new Response(JSON.stringify({ error: msg }), { status, headers: CORS });

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url   = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // URL shape: /api/<resource>[/<id>]
  const resource = parts[1];
  const id       = parts[2];
  const method   = request.method;
  const DB       = env.DB;

  try {

    // ── STUDENTS ────────────────────────────────────────────────────────────
    if (resource === 'students') {

      // GET /api/students
      if (method === 'GET') {
        const { results } = await DB.prepare(
          'SELECT * FROM students ORDER BY created_at ASC'
        ).all();
        return ok({ students: results });
      }

      // POST /api/students  — single or bulk (array)
      if (method === 'POST') {
        const body = await request.json();

        if (Array.isArray(body)) {
          // Bulk insert — skip duplicates
          let added = 0;
          const stmt = DB.prepare(
            'INSERT OR IGNORE INTO students (id, code, name, created_at) VALUES (?, ?, ?, ?)'
          );
          for (const { name, code } of body) {
            if (!name || !code) continue;
            const res = await stmt.bind(
              crypto.randomUUID(), code, name, new Date().toISOString()
            ).run();
            if (res.changes) added++;
          }
          return ok({ added, skipped: body.length - added });
        }

        // Single insert
        const { name, code } = body;
        const sid = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await DB.prepare(
            'INSERT INTO students (id, code, name, created_at) VALUES (?, ?, ?, ?)'
          ).bind(sid, code, name, now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE'))
            return err('السجل المدني مسجّل مسبقاً', 409);
          throw e;
        }
        return ok({ student: { id: sid, code, name, created_at: now } }, 201);
      }

      // DELETE /api/students/:id
      if (method === 'DELETE' && id) {
        await DB.prepare('DELETE FROM students WHERE id = ?').bind(id).run();
        return ok({ ok: true });
      }
    }

    // ── PLANS ───────────────────────────────────────────────────────────────
    if (resource === 'plans') {

      // GET /api/plans
      if (method === 'GET') {
        const { results } = await DB.prepare(
          'SELECT * FROM plans ORDER BY created_at DESC'
        ).all();
        return ok({
          plans: results.map(r => ({ ...r, gaps: JSON.parse(r.gaps || '[]') }))
        });
      }

      // POST /api/plans — upsert (delete old, insert new)
      if (method === 'POST') {
        const { studentId, studentName, status, gaps, adminNote } = await request.json();
        await DB.prepare('DELETE FROM plans WHERE student_id = ?').bind(studentId).run();
        const pid = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare(
          `INSERT INTO plans
           (id, student_id, student_name, status, gaps, admin_note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(pid, studentId, studentName, status, JSON.stringify(gaps), adminNote || '', now).run();
        return ok({
          plan: {
            id: pid, student_id: studentId, student_name: studentName,
            status, gaps, admin_note: adminNote || '', created_at: now
          }
        }, 201);
      }

      // PATCH /api/plans/:id — approve
      if (method === 'PATCH' && id) {
        const { adminNote } = await request.json();
        const now = new Date().toISOString();
        await DB.prepare(
          'UPDATE plans SET status = ?, admin_note = ?, approved_at = ? WHERE id = ?'
        ).bind('active', adminNote || '', now, id).run();
        const p = await DB.prepare('SELECT * FROM plans WHERE id = ?').bind(id).first();
        return ok({ plan: { ...p, gaps: JSON.parse(p.gaps || '[]') } });
      }
    }

    // ── QUESTIONS ───────────────────────────────────────────────────────────
    if (resource === 'questions') {

      // GET /api/questions
      if (method === 'GET') {
        const { results } = await DB.prepare(
          'SELECT * FROM questions ORDER BY qnum ASC'
        ).all();
        return ok({ questions: results });
      }

      // POST /api/questions  body: { action: 'replace'|'append', questions: [...] }
      if (method === 'POST') {
        const { action = 'append', questions: rows } = await request.json();

        if (action === 'replace') {
          await DB.prepare('DELETE FROM questions').run();
        }

        const { results: existing } = await DB.prepare('SELECT qnum FROM questions').all();
        const existingNums = new Set(existing.map(r => r.qnum));
        const fresh = rows.filter(r => !existingNums.has(r.qnum));

        const stmt = DB.prepare(
          `INSERT INTO questions
           (id, qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const q of fresh) {
          await stmt.bind(
            crypto.randomUUID(), q.qnum, q.type, q.skillId,
            q.text, q.opts[0], q.opts[1], q.opts[2], q.opts[3],
            q.ans, new Date().toISOString()
          ).run();
        }
        return ok({ added: fresh.length, skipped: rows.length - fresh.length });
      }
    }

    // ── ADMINS ──────────────────────────────────────────────────────────────
    if (resource === 'admins' && id && method === 'GET') {
      const admin = await DB.prepare(
        'SELECT * FROM admins WHERE code = ?'
      ).bind(id).first();
      if (!admin) return ok({ admin: null }, 404);
      return ok({ admin });
    }

    return err('Not found', 404);

  } catch (e) {
    console.error('[API Error]', e);
    return err(e.message || 'Server error', 500);
  }
}
