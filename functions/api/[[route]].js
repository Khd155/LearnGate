// Cloudflare Pages Function — /api/* handler
// D1 binding: DB | Dev key env var: DEV_KEY

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Dev-Key',
};

const ok  = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: CORS });
const err = (m, s = 400) => new Response(JSON.stringify({ error: m }), { status: s, headers: CORS });

function getDevKey(env) {
  return env.DEV_KEY || 'learngate-dev-2026';
}

function authDev(request, env) {
  const key = request.headers.get('X-Dev-Key') || '';
  return key === getDevKey(env);
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url      = new URL(request.url);
  const parts    = url.pathname.split('/').filter(Boolean);
  const resource = parts[1];   // e.g. 'students', 'plans', 'dev'
  const sub      = parts[2];   // e.g. student id, 'admins'
  const subsub   = parts[3];   // e.g. admin id
  const method   = request.method;
  const DB       = env.DB;
  const school   = url.searchParams.get('school') || '';

  try {

    // ── SCHOOLS ─────────────────────────────────────────────────────────────
    if (resource === 'schools' && method === 'GET') {
      const { results } = await DB.prepare('SELECT * FROM schools ORDER BY name ASC').all();
      return ok({ schools: results });
    }

    // ── STUDENTS ─────────────────────────────────────────────────────────────
    if (resource === 'students') {

      if (method === 'GET') {
        let q = 'SELECT * FROM students';
        const params = [];
        if (school) { q += ' WHERE school = ?'; params.push(school); }
        q += ' ORDER BY created_at ASC';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ students: results });
      }

      if (method === 'POST') {
        const body = await request.json();

        if (Array.isArray(body)) {
          let added = 0;
          const stmt = DB.prepare(
            'INSERT OR IGNORE INTO students (id, code, name, school, created_at) VALUES (?, ?, ?, ?, ?)'
          );
          for (const { name, code, school: s } of body) {
            if (!name || !code) continue;
            const res = await stmt.bind(crypto.randomUUID(), code, name, s || school, new Date().toISOString()).run();
            if (res.changes) added++;
          }
          return ok({ added, skipped: body.length - added });
        }

        const { name, code, school: bodySchool } = body;
        const sid = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await DB.prepare(
            'INSERT INTO students (id, code, name, school, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(sid, code, name, bodySchool || school, now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE'))
            return err('السجل المدني مسجّل مسبقاً', 409);
          throw e;
        }
        return ok({ student: { id: sid, code, name, school: bodySchool || school, created_at: now } }, 201);
      }

      if (method === 'DELETE' && sub) {
        await DB.prepare('DELETE FROM students WHERE id = ?').bind(sub).run();
        return ok({ ok: true });
      }
    }

    // ── PLANS ────────────────────────────────────────────────────────────────
    if (resource === 'plans') {

      if (method === 'GET') {
        let q = 'SELECT * FROM plans';
        const params = [];
        if (school) { q += ' WHERE school = ?'; params.push(school); }
        q += ' ORDER BY created_at DESC';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ plans: results.map(r => ({ ...r, gaps: JSON.parse(r.gaps || '[]') })) });
      }

      if (method === 'POST') {
        const { studentId, studentName, status, gaps, adminNote, school: bodySchool } = await request.json();
        await DB.prepare('DELETE FROM plans WHERE student_id = ?').bind(studentId).run();
        const pid = crypto.randomUUID();
        const now = new Date().toISOString();
        const planSchool = bodySchool || school;
        await DB.prepare(
          `INSERT INTO plans (id, student_id, student_name, status, gaps, admin_note, school, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(pid, studentId, studentName, status, JSON.stringify(gaps), adminNote || '', planSchool, now).run();
        return ok({ plan: { id: pid, student_id: studentId, student_name: studentName, status, gaps, admin_note: adminNote || '', school: planSchool, created_at: now } }, 201);
      }

      if (method === 'PATCH' && sub) {
        const { adminNote } = await request.json();
        const now = new Date().toISOString();
        await DB.prepare(
          'UPDATE plans SET status = ?, admin_note = ?, approved_at = ? WHERE id = ?'
        ).bind('active', adminNote || '', now, sub).run();
        const p = await DB.prepare('SELECT * FROM plans WHERE id = ?').bind(sub).first();
        return ok({ plan: { ...p, gaps: JSON.parse(p.gaps || '[]') } });
      }
    }

    // ── QUESTIONS ────────────────────────────────────────────────────────────
    if (resource === 'questions') {

      if (method === 'GET') {
        const { results } = await DB.prepare('SELECT * FROM questions ORDER BY qnum ASC').all();
        return ok({ questions: results });
      }

      if (method === 'POST') {
        const { action = 'append', questions: rows } = await request.json();
        if (action === 'replace') await DB.prepare('DELETE FROM questions').run();
        const { results: existing } = await DB.prepare('SELECT qnum FROM questions').all();
        const existingNums = new Set(existing.map(r => r.qnum));
        const fresh = rows.filter(r => !existingNums.has(r.qnum));
        const stmt = DB.prepare(
          `INSERT INTO questions (id, qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const q of fresh) {
          await stmt.bind(crypto.randomUUID(), q.qnum, q.type, q.skillId, q.text,
            q.opts[0], q.opts[1], q.opts[2], q.opts[3], q.ans, new Date().toISOString()).run();
        }
        return ok({ added: fresh.length, skipped: rows.length - fresh.length });
      }
    }

    // ── ADMINS ───────────────────────────────────────────────────────────────
    if (resource === 'admins' && sub && method === 'GET') {
      // sub = admin code, school = selected school
      const admin = await DB.prepare('SELECT * FROM admins WHERE code = ?').bind(sub).first();
      if (!admin) return ok({ admin: null }, 404);
      // school='*' means superadmin, can access any school
      if (admin.school !== '*' && school && admin.school !== school) {
        return ok({ admin: null }, 404);
      }
      return ok({ admin });
    }

    // ── DEV ENDPOINTS ────────────────────────────────────────────────────────
    if (resource === 'dev') {

      if (!authDev(request, env)) return err('Unauthorized', 401);

      // GET /api/dev/stats — stats per school
      if (sub === 'stats' && method === 'GET') {
        const { results: schools } = await DB.prepare('SELECT name FROM schools ORDER BY name').all();
        const stats = [];
        for (const { name } of schools) {
          const s = await DB.prepare('SELECT COUNT(*) as c FROM students WHERE school = ?').bind(name).first();
          const pp = await DB.prepare("SELECT COUNT(*) as c FROM plans WHERE school = ? AND status='pending'").bind(name).first();
          const ap = await DB.prepare("SELECT COUNT(*) as c FROM plans WHERE school = ? AND status='active'").bind(name).first();
          stats.push({ school: name, students: s.c, pending: pp.c, active: ap.c });
        }
        const tot_s = await DB.prepare('SELECT COUNT(*) as c FROM students').first();
        const tot_a = await DB.prepare('SELECT COUNT(*) as c FROM admins').first();
        const tot_q = await DB.prepare('SELECT COUNT(*) as c FROM questions').first();
        return ok({ stats, totals: { students: tot_s.c, admins: tot_a.c, questions: tot_q.c, schools: schools.length } });
      }

      // GET /api/dev/admins — all admins
      if (sub === 'admins' && method === 'GET') {
        const { results } = await DB.prepare('SELECT * FROM admins ORDER BY school, name').all();
        return ok({ admins: results });
      }

      // POST /api/dev/admins — add admin
      if (sub === 'admins' && method === 'POST') {
        const { name, code, school: adminSchool } = await request.json();
        if (!name || !code) return err('name and code required');
        const aid = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await DB.prepare(
            'INSERT INTO admins (id, name, code, school, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(aid, name, code, adminSchool || '', now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) return err('السجل المدني مسجّل مسبقاً', 409);
          throw e;
        }
        return ok({ admin: { id: aid, name, code, school: adminSchool || '', created_at: now } }, 201);
      }

      // DELETE /api/dev/admins/:id
      if (sub === 'admins' && subsub && method === 'DELETE') {
        await DB.prepare('DELETE FROM admins WHERE id = ?').bind(subsub).run();
        return ok({ ok: true });
      }

      // GET /api/dev/schools
      if (sub === 'schools' && method === 'GET') {
        const { results } = await DB.prepare('SELECT * FROM schools ORDER BY name').all();
        return ok({ schools: results });
      }

      // POST /api/dev/schools — add school
      if (sub === 'schools' && method === 'POST') {
        const { name } = await request.json();
        if (!name) return err('name required');
        const sid = 'school-' + crypto.randomUUID().slice(0, 8);
        const now = new Date().toISOString();
        try {
          await DB.prepare('INSERT INTO schools (id, name, created_at) VALUES (?, ?, ?)').bind(sid, name, now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) return err('المدرسة موجودة مسبقاً', 409);
          throw e;
        }
        return ok({ school: { id: sid, name, created_at: now } }, 201);
      }

      // DELETE /api/dev/schools/:id
      if (sub === 'schools' && subsub && method === 'DELETE') {
        await DB.prepare('DELETE FROM schools WHERE id = ?').bind(subsub).run();
        return ok({ ok: true });
      }

      // DELETE /api/dev/students?school=X — clear all students of a school
      if (sub === 'students' && method === 'DELETE') {
        const targetSchool = url.searchParams.get('school');
        if (!targetSchool) return err('school param required');
        await DB.prepare('DELETE FROM students WHERE school = ?').bind(targetSchool).run();
        return ok({ ok: true });
      }

      // DELETE /api/dev/questions — clear all questions
      if (sub === 'questions' && method === 'DELETE') {
        await DB.prepare('DELETE FROM questions').run();
        return ok({ ok: true });
      }
    }

    return err('Not found', 404);

  } catch (e) {
    console.error('[API Error]', e);
    return err(e.message || 'Server error', 500);
  }
}
