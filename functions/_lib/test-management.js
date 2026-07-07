// Dev-only test management helpers — bio quiz attempt reset + bulk retake grants.
// Kept separate from functions/api/[[route]].js so the new logic is unit-testable
// without spinning up the full Pages Function request/response plumbing.

export async function listTestResults(DB, { school, studentId } = {}) {
  let q = 'SELECT id, student_id, student_name, school, subject, test_type, score, correct, total, created_at FROM test_results';
  const conds = [], params = [];
  if (school) { conds.push('school = ?'); params.push(school); }
  if (studentId) { conds.push('student_id = ?'); params.push(studentId); }
  if (conds.length) q += ' WHERE ' + conds.join(' AND ');
  q += ' ORDER BY created_at DESC LIMIT 1000';
  const { results } = await DB.prepare(q).bind(...params).all();
  return results;
}

export async function deleteSingleTestResult(DB, id) {
  await DB.prepare('DELETE FROM test_answers WHERE result_id = ?').bind(id).run();
  await DB.prepare('DELETE FROM test_results WHERE id = ?').bind(id).run();
}

export async function resetStudentTestResults(DB, studentId) {
  const { results: ids } = await DB.prepare('SELECT id FROM test_results WHERE student_id = ?').bind(studentId).all();
  for (const r of ids) { await DB.prepare('DELETE FROM test_answers WHERE result_id = ?').bind(r.id).run(); }
  await DB.prepare('DELETE FROM test_results WHERE student_id = ?').bind(studentId).run();
  return ids.length;
}

export async function resetSchoolTestResults(DB, school) {
  const { results: ids } = await DB.prepare('SELECT id FROM test_results WHERE school = ?').bind(school).all();
  for (const r of ids) { await DB.prepare('DELETE FROM test_answers WHERE result_id = ?').bind(r.id).run(); }
  await DB.prepare('DELETE FROM test_results WHERE school = ?').bind(school).run();
  return ids.length;
}

// Pure query builder — split out from grantRetakeForSchool so the SQL shape itself
// is unit-testable without a DB.
export function buildGrantRetakeQuery({ school, studentId } = {}) {
  if (!school && !studentId) throw new Error('يلزم تحديد studentId أو school');
  let q = `
    UPDATE plans SET admin_note = CASE
        WHEN admin_note LIKE 'OVERRIDE:%' THEN admin_note
        ELSE 'OVERRIDE:' || COALESCE(admin_note, '')
      END
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at DESC) as rn
        FROM plans`;
  const params = [];
  if (studentId) { q += ' WHERE student_id = ?'; params.push(studentId); }
  else { q += ' WHERE school = ?'; params.push(school); }
  q += `
      ) ranked WHERE rn = 1
    )`;
  return { sql: q, params };
}

export async function grantRetakeForSchool(DB, { school, studentId } = {}) {
  const { sql, params } = buildGrantRetakeQuery({ school, studentId });
  const result = await DB.prepare(sql).bind(...params).run();
  return result.meta?.changes ?? 0;
}
