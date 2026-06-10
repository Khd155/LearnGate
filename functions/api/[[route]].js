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

      if (method === 'GET' && sub === 'history') {
        const studentId = url.searchParams.get('studentId');
        if (!studentId) return err('studentId param required');
        let q = 'SELECT * FROM plans WHERE student_id = ?';
        const params = [studentId];
        if (school) { q += ' AND school = ?'; params.push(school); }
        q += ' ORDER BY created_at DESC';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ plans: results.map(r => ({ ...r, gaps: JSON.parse(r.gaps || '[]') })) });
      }

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

    // GET /api/admins?school=X — public list (name+id only, no codes)
    if (resource === 'admins' && !sub && method === 'GET' && school) {
      const { results } = await DB.prepare(
        "SELECT id, name FROM admins WHERE school = ? AND school != '' ORDER BY name ASC"
      ).bind(school).all();
      return ok({ admins: results });
    }

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
        try { await DB.prepare('ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT "admin"').run(); } catch {}
        const { results } = await DB.prepare('SELECT * FROM admins ORDER BY school, name').all();
        return ok({ admins: results });
      }

      // POST /api/dev/admins — add admin
      if (sub === 'admins' && method === 'POST') {
        const { name, code, school: adminSchool, role: adminRole } = await request.json();
        if (!name || !code) return err('name and code required');
        // Ensure role column exists (idempotent migration)
        try { await DB.prepare('ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT "admin"').run(); } catch {}
        const aid = crypto.randomUUID();
        const now = new Date().toISOString();
        const role = adminRole === 'director' ? 'director' : 'admin';
        try {
          await DB.prepare(
            'INSERT INTO admins (id, name, code, school, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(aid, name, code, adminSchool || '', role, now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) return err('السجل المدني مسجّل مسبقاً', 409);
          throw e;
        }
        return ok({ admin: { id: aid, name, code, school: adminSchool || '', role, created_at: now } }, 201);
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

      // GET /api/dev/students — all students (optional ?school=X filter)
      if (sub === 'students' && method === 'GET') {
        const filterSchool = url.searchParams.get('school');
        try {
          let q = `SELECT s.id, s.code, s.name, s.school, s.created_at,
                          p.status as plan_status
                   FROM students s
                   LEFT JOIN plans p ON p.student_id = s.id`;
          const params = [];
          if (filterSchool) { q += ' WHERE s.school = ?'; params.push(filterSchool); }
          q += ' ORDER BY s.school, s.name ASC';
          const { results } = await DB.prepare(q).bind(...params).all();
          return ok({ students: results });
        } catch (e) {
          // Fallback if school column not yet added (migration not run)
          if (e.message && e.message.includes('no such column')) {
            const { results } = await DB.prepare(
              'SELECT s.id, s.code, s.name, s.created_at, p.status as plan_status FROM students s LEFT JOIN plans p ON p.student_id = s.id ORDER BY s.name ASC'
            ).all();
            return ok({ students: results.map(r => ({ ...r, school: '' })) });
          }
          throw e;
        }
      }

      // POST /api/dev/students — add single student from dev panel
      if (sub === 'students' && method === 'POST') {
        const { name, code, school: bodySchool } = await request.json();
        if (!name || !code) return err('name and code required');
        const sid = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await DB.prepare(
            'INSERT INTO students (id, code, name, school, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(sid, code, name, bodySchool || '', now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) return err('السجل المدني مسجّل مسبقاً', 409);
          throw e;
        }
        return ok({ student: { id: sid, code, name, school: bodySchool || '', created_at: now } }, 201);
      }

      // DELETE /api/dev/students/:id — delete single student
      if (sub === 'students' && subsub && method === 'DELETE') {
        await DB.prepare('DELETE FROM students WHERE id = ?').bind(subsub).run();
        return ok({ ok: true });
      }

      // DELETE /api/dev/students?school=X — clear all students of a school
      if (sub === 'students' && !subsub && method === 'DELETE') {
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

      // POST /api/dev/migrate — create chat & ticket tables
      if (sub === 'migrate' && method === 'POST') {
        await DB.prepare(`CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          student_name TEXT NOT NULL,
          school TEXT NOT NULL DEFAULT '',
          sender_type TEXT NOT NULL,
          body TEXT NOT NULL,
          is_read INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        )`).run();
        await DB.prepare(`CREATE TABLE IF NOT EXISTS tickets (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          student_name TEXT NOT NULL,
          school TEXT NOT NULL DEFAULT '',
          subject TEXT NOT NULL,
          status TEXT DEFAULT 'open',
          created_at TEXT NOT NULL
        )`).run();
        await DB.prepare(`CREATE TABLE IF NOT EXISTS ticket_replies (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL,
          sender_type TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`).run();
        // Add recipient_admin_id column if not exists (idempotent)
        try { await DB.prepare('ALTER TABLE messages ADD COLUMN recipient_admin_id TEXT DEFAULT ""').run(); } catch {}
        // Add role column to admins if not exists
        try { await DB.prepare('ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT "admin"').run(); } catch {}
        return ok({ ok: true, tables: ['messages', 'tickets', 'ticket_replies'] });
      }
    }

    // ── DIRECTOR ENDPOINTS ───────────────────────────────────────────────────
    if (resource === 'director') {

      // Helper: verify director auth
      async function authDirector(code, targetSchool) {
        if (!code) return null;
        const a = await DB.prepare('SELECT * FROM admins WHERE code = ?').bind(code).first();
        if (!a || a.role !== 'director') return null;
        if (a.school !== '*' && targetSchool && a.school !== targetSchool) return null;
        return a;
      }

      // GET /api/director/admins?school=X&director_code=Y
      if (sub === 'admins' && method === 'GET') {
        const dir = await authDirector(url.searchParams.get('director_code'), school);
        if (!dir) return err('Unauthorized', 401);
        const { results } = await DB.prepare(
          "SELECT id, name, code, role FROM admins WHERE school = ? ORDER BY name ASC"
        ).bind(school).all();
        return ok({ admins: results });
      }

      // POST /api/director/admins — add supervisor
      if (sub === 'admins' && method === 'POST') {
        const { name, code: newCode, director_code } = await request.json();
        const dir = await authDirector(director_code, school);
        if (!dir) return err('Unauthorized', 401);
        if (!name || !newCode) return err('name and code required');
        if (!/^\d{10}$/.test(newCode)) return err('الرمز يجب أن يكون 10 أرقام');
        const adminSchool = dir.school === '*' ? school : dir.school;
        const aid = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await DB.prepare(
            'INSERT INTO admins (id, name, code, school, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(aid, name, newCode, adminSchool, 'admin', now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) return err('الرمز مسجّل مسبقاً', 409);
          throw e;
        }
        return ok({ admin: { id: aid, name, code: newCode, school: adminSchool, role: 'admin', created_at: now } }, 201);
      }

      // DELETE /api/director/admins/:id?school=X&director_code=Y
      if (sub === 'admins' && subsub && method === 'DELETE') {
        const dir = await authDirector(url.searchParams.get('director_code'), school);
        if (!dir) return err('Unauthorized', 401);
        const target = await DB.prepare('SELECT * FROM admins WHERE id = ?').bind(subsub).first();
        if (!target) return err('Admin not found', 404);
        if (target.role === 'director') return err('لا يمكن حذف مدير', 403);
        await DB.prepare('DELETE FROM admins WHERE id = ?').bind(subsub).run();
        return ok({ ok: true });
      }

      // PATCH /api/director/questions/:id?director_code=Y&school=X — edit one question
      if (sub === 'questions' && subsub && method === 'PATCH') {
        const dir = await authDirector(url.searchParams.get('director_code'), school);
        if (!dir) return err('Unauthorized', 401);
        const { qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans } = await request.json();
        await DB.prepare(
          'UPDATE questions SET qnum=?,type=?,skill_id=?,text=?,opt1=?,opt2=?,opt3=?,opt4=?,ans=? WHERE id=?'
        ).bind(qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans, subsub).run();
        return ok({ ok: true });
      }

      // DELETE /api/director/questions/:id?director_code=Y&school=X — delete one question
      if (sub === 'questions' && subsub && method === 'DELETE') {
        const dir = await authDirector(url.searchParams.get('director_code'), school);
        if (!dir) return err('Unauthorized', 401);
        await DB.prepare('DELETE FROM questions WHERE id = ?').bind(subsub).run();
        return ok({ ok: true });
      }

      // POST /api/director/questions — import questions (director auth)
      if (sub === 'questions' && method === 'POST') {
        const body = await request.json();
        const dir = await authDirector(body.director_code, school);
        if (!dir) return err('Unauthorized', 401);
        const { action = 'append', questions: rows } = body;
        if (!Array.isArray(rows) || !rows.length) return err('no questions');
        if (action === 'replace') await DB.prepare('DELETE FROM questions').run();
        const { results: existing } = await DB.prepare('SELECT qnum FROM questions').all();
        const existingNums = new Set(existing.map(r => r.qnum));
        const fresh = rows.filter(r => !existingNums.has(r.qnum));
        for (const q of fresh) {
          const qid = crypto.randomUUID();
          const now = new Date().toISOString();
          await DB.prepare(
            'INSERT INTO questions (id,qnum,type,skill_id,text,opt1,opt2,opt3,opt4,ans,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
          ).bind(qid, q.qnum, q.type, q.skillId, q.text, q.opt1, q.opt2, q.opt3, q.opt4, q.ans, now).run();
        }
        return ok({ added: fresh.length, skipped: rows.length - fresh.length });
      }
    }

    // ── MESSAGES ─────────────────────────────────────────────────────────────
    if (resource === 'messages') {

      // GET /api/messages/unread?school=X&adminId=Y — unread per student
      // Omit school to get all schools (support admin view)
      if (sub === 'unread' && method === 'GET') {
        const adminId = url.searchParams.get('adminId') || '';
        let q, params;
        if (adminId) {
          q = `SELECT student_id, student_name, school, COUNT(*) as cnt FROM messages
               WHERE sender_type='student' AND is_read=0 AND school=? AND recipient_admin_id=?
               GROUP BY student_id`;
          params = [school, adminId];
        } else if (school) {
          q = `SELECT student_id, student_name, school, COUNT(*) as cnt FROM messages
               WHERE sender_type='student' AND is_read=0 AND school=?
               GROUP BY student_id`;
          params = [school];
        } else {
          q = `SELECT student_id, student_name, school, COUNT(*) as cnt FROM messages
               WHERE sender_type='student' AND is_read=0
               GROUP BY student_id`;
          params = [];
        }
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ counts: results });
      }

      // GET /api/messages?studentId=X&adminId=Y — conversation between student and specific admin
      if (method === 'GET') {
        const studentId = url.searchParams.get('studentId');
        const adminId   = url.searchParams.get('adminId') || '';
        if (!studentId) return err('studentId required');
        let q, params;
        if (adminId) {
          q = 'SELECT * FROM messages WHERE student_id=? AND recipient_admin_id=? ORDER BY created_at ASC';
          params = [studentId, adminId];
        } else {
          q = 'SELECT * FROM messages WHERE student_id=? ORDER BY created_at ASC';
          params = [studentId];
        }
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ messages: results });
      }

      // POST /api/messages — send message
      if (method === 'POST') {
        const { studentId, studentName, senderType, body,
                school: bodySchool, recipientAdminId } = await request.json();
        if (!studentId || !senderType || !body) return err('missing fields');
        const effectiveSchool = school || bodySchool || '';
        const id  = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare(
          'INSERT INTO messages (id, student_id, student_name, school, sender_type, body, is_read, recipient_admin_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)'
        ).bind(id, studentId, studentName || '', effectiveSchool, senderType, body, recipientAdminId || '', now).run();
        return ok({ message: { id, student_id: studentId, student_name: studentName, school: effectiveSchool, sender_type: senderType, body, is_read: 0, recipient_admin_id: recipientAdminId || '', created_at: now } }, 201);
      }

      // PATCH /api/messages/read — mark messages as read
      if (sub === 'read' && method === 'PATCH') {
        const { studentId, readerType } = await request.json();
        const senderType = readerType === 'admin' ? 'student' : 'admin';
        await DB.prepare(
          'UPDATE messages SET is_read=1 WHERE student_id=? AND sender_type=? AND is_read=0'
        ).bind(studentId, senderType).run();
        return ok({ ok: true });
      }
    }

    // ── TICKETS ──────────────────────────────────────────────────────────────
    if (resource === 'tickets') {

      // GET /api/tickets?studentId=X — student's tickets
      // GET /api/tickets?school=X    — all school tickets (admin)
      if (method === 'GET' && !sub) {
        const studentId = url.searchParams.get('studentId');
        let q, params;
        if (studentId) {
          q = 'SELECT * FROM tickets WHERE student_id=? ORDER BY created_at DESC';
          params = [studentId];
        } else {
          q = school
            ? 'SELECT * FROM tickets WHERE school=? ORDER BY created_at DESC'
            : 'SELECT * FROM tickets ORDER BY created_at DESC';
          params = school ? [school] : [];
        }
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ tickets: results });
      }

      // GET /api/tickets/:id — ticket + replies
      if (method === 'GET' && sub && !subsub) {
        const ticket = await DB.prepare('SELECT * FROM tickets WHERE id=?').bind(sub).first();
        if (!ticket) return err('not found', 404);
        const { results: replies } = await DB.prepare(
          'SELECT * FROM ticket_replies WHERE ticket_id=? ORDER BY created_at ASC'
        ).bind(sub).all();
        return ok({ ticket, replies });
      }

      // POST /api/tickets — create ticket
      if (method === 'POST' && !sub) {
        const { studentId, studentName, subject, body, school: bodySchool } = await request.json();
        if (!studentId || !subject || !body) return err('missing fields');
        const effectiveSchool = school || bodySchool || '';
        const tid = crypto.randomUUID();
        const rid = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare(
          'INSERT INTO tickets (id, student_id, student_name, school, subject, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(tid, studentId, studentName || '', effectiveSchool, subject, 'open', now).run();
        await DB.prepare(
          'INSERT INTO ticket_replies (id, ticket_id, sender_type, body, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(rid, tid, 'student', body, now).run();
        return ok({ ticket: { id: tid, student_id: studentId, student_name: studentName, school: effectiveSchool, subject, status: 'open', created_at: now } }, 201);
      }

      // POST /api/tickets/:id/reply — add reply
      if (method === 'POST' && sub && subsub === 'reply') {
        const { senderType, body } = await request.json();
        if (!senderType || !body) return err('missing fields');
        const id  = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare(
          'INSERT INTO ticket_replies (id, ticket_id, sender_type, body, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(id, sub, senderType, body, now).run();
        if (senderType === 'admin') {
          await DB.prepare(
            "UPDATE tickets SET status='in_progress' WHERE id=? AND status='open'"
          ).bind(sub).run();
        }
        return ok({ reply: { id, ticket_id: sub, sender_type: senderType, body, created_at: now } }, 201);
      }

      // PATCH /api/tickets/:id — update status
      if (method === 'PATCH' && sub && !subsub) {
        const { status } = await request.json();
        if (!['open','in_progress','resolved'].includes(status)) return err('invalid status');
        await DB.prepare('UPDATE tickets SET status=? WHERE id=?').bind(status, sub).run();
        const t = await DB.prepare('SELECT * FROM tickets WHERE id=?').bind(sub).first();
        return ok({ ticket: t });
      }
    }

    return err('Not found', 404);

  } catch (e) {
    console.error('[API Error]', e);
    return err(e.message || 'Server error', 500);
  }
}
