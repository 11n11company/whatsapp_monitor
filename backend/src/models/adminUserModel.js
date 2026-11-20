const db = require('../config/db');
const bcrypt = require('bcryptjs');

class AdminUserModel {
  /**
   * Find active admin user by username (case-insensitive)
   * @param {string} username
   * @returns {Promise<Object|null>}
   */
  static async findByUsername(username) {
    const queryText = `
      SELECT id, username, password_hash, email, full_name, role, is_active, last_login, created_at, updated_at
      FROM admin_users
      WHERE LOWER(username) = LOWER($1) AND is_active = true
      LIMIT 1;
    `;
    const result = await db.query(queryText, [username]);
    return result.rows[0] || null;
  }

  /**
   * Find admin user by ID
   * @param {number|string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const queryText = `
      SELECT id, username, email, full_name, role, is_active, last_login, created_at, updated_at
      FROM admin_users
      WHERE id = $1 AND is_active = true
      LIMIT 1;
    `;
    const result = await db.query(queryText, [id]);
    return result.rows[0] || null;
  }

  /**
   * Update last login timestamp
   * @param {number|string} id
   */
  static async updateLastLogin(id) {
    const queryText = `
      UPDATE admin_users
      SET last_login = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    await db.query(queryText, [id]);
  }

  /**
   * Count total admin accounts (to enforce single admin constraint)
   * @returns {Promise<number>}
   */
  static async countAdmins() {
    const queryText = `SELECT COUNT(*) AS count FROM admin_users;`;
    const result = await db.query(queryText);
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Create an admin user (used by seeder / setup)
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  static async createAdmin({ username, passwordHash, email, fullName }) {
    const queryText = `
      INSERT INTO admin_users (username, password_hash, email, full_name, role)
      VALUES ($1, $2, $3, $4, 'admin')
      RETURNING id, username, email, full_name, role, is_active, created_at;
    `;
    const result = await db.query(queryText, [username, passwordHash, email, fullName]);
    return result.rows[0];
  }

  /**
   * Compare plain text password with stored bcrypt hash
   * @param {string} plainPassword
   * @param {string} passwordHash
   * @returns {Promise<boolean>}
   */
  static async verifyPassword(plainPassword, passwordHash) {
    return bcrypt.compare(plainPassword, passwordHash);
  }

  /**
   * Hash a plain text password using bcrypt
   * @param {string} plainPassword
   * @param {number} saltRounds
   * @returns {Promise<string>}
   */
  static async hashPassword(plainPassword, saltRounds = 10) {
    return bcrypt.hash(plainPassword, saltRounds);
  }
}

module.exports = AdminUserModel;

