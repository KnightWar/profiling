const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });
async function run() {
  try {
    const res = await pool.query('DELETE FROM scores WHERE response_id IN (SELECT id FROM responses WHERE question_id = $1)', [9999]);
    console.log('Success:', res.rowCount);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}
run();
