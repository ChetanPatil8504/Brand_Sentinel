import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection.js';
import { generateToken, AuthRequest } from '../middleware/auth.js';
import { recordAuditLog } from '../middleware/audit.js';

// Dynamic User Registration (Public - strictly restricted to CONTENT_CREATOR)
export function register(req: Request, res: Response): void {
  const { email, password, fullName, role } = req.body;

  if (!email || !password || !fullName) {
    res.status(400).json({ error: 'Full name, email, and password are required' });
    return;
  }

  // Security Rule 3: Public registration must NEVER allow Brand Administrator or Human Reviewer
  if (role && role !== 'CONTENT_CREATOR') {
    res.status(403).json({
      error: 'Public registration is restricted to Content Creators. Brand Administrator and Human Reviewer roles require authorized administrative assignment.'
    });
    return;
  }

  const assignedRole = 'CONTENT_CREATOR';

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const trimmedEmail = email.trim().toLowerCase();
  if (!emailRegex.test(trimmedEmail) || trimmedEmail.length > 255) {
    res.status(400).json({ error: 'Please provide a valid email address format' });
    return;
  }

  // Password policy validation: minimum 8 characters, letters and numbers
  if (password.length < 8 || password.length > 128 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    res.status(400).json({
      error: 'Password must be at least 8 characters long and contain both letters and numbers'
    });
    return;
  }

  // Full name validation
  const trimmedName = fullName.trim();
  if (trimmedName.length < 2 || trimmedName.length > 100) {
    res.status(400).json({ error: 'Full name must be between 2 and 100 characters' });
    return;
  }

  // Duplicate email check (case-insensitive)
  const existing = db.prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`).get(trimmedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email address already exists' });
    return;
  }

  // Hash password securely - never store plaintext
  const userId = 'usr_' + uuidv4().slice(0, 16);
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, trimmedEmail, passwordHash, trimmedName, assignedRole);

  // Associate new user with default brand membership
  const defaultBrand = db.prepare(`SELECT id FROM brands LIMIT 1`).get() as any;
  if (defaultBrand) {
    db.prepare(`
      INSERT INTO brand_members (id, brand_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), defaultBrand.id, userId, assignedRole);
  }

  const token = generateToken({
    id: userId,
    email: trimmedEmail,
    fullName: trimmedName,
    role: assignedRole
  });

  recordAuditLog({
    userId,
    action: 'USER_REGISTERED',
    metadata: { email: trimmedEmail, role: assignedRole }
  });

  res.status(201).json({
    token,
    user: {
      id: userId,
      email: trimmedEmail,
      fullName: trimmedName,
      role: assignedRole
    }
  });
}

// Dynamic Login
export function login(req: Request, res: Response): void {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const trimmedEmail = email.trim().toLowerCase();
  const user = db.prepare(`SELECT * FROM users WHERE LOWER(email) = LOWER(?)`).get(trimmedEmail) as any;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = generateToken({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role
  });

  recordAuditLog({
    userId: user.id,
    action: 'USER_LOGGED_IN',
    metadata: { role: user.role, email: user.email }
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      avatarUrl: user.avatar_url
    }
  });
}

// Get current user profile
export function getMe(req: AuthRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = db.prepare(`SELECT id, email, full_name, role, avatar_url, created_at FROM users WHERE id = ?`).get(req.user.id) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const brand = db.prepare(`
    SELECT b.* FROM brands b
    JOIN brand_members bm ON b.id = bm.brand_id
    WHERE bm.user_id = ?
    LIMIT 1
  `).get(user.id);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      avatarUrl: user.avatar_url,
      brand
    }
  });
}

// Admin User Provisioning (Admins can provision Reviewers and additional Administrators)
export function adminCreateUser(req: AuthRequest, res: Response): void {
  const { email, password, fullName, role } = req.body;

  if (!email || !password || !fullName || !role) {
    res.status(400).json({ error: 'Full name, email, password, and role are required' });
    return;
  }

  const validRoles = ['CONTENT_CREATOR', 'HUMAN_REVIEWER', 'BRAND_ADMIN'];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: `Invalid role. Allowed roles: ${validRoles.join(', ')}` });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const trimmedEmail = email.trim().toLowerCase();
  if (!emailRegex.test(trimmedEmail)) {
    res.status(400).json({ error: 'Invalid email address format' });
    return;
  }

  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers' });
    return;
  }

  const existing = db.prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`).get(trimmedEmail);
  if (existing) {
    res.status(409).json({ error: 'User with this email already exists' });
    return;
  }

  const userId = 'usr_' + uuidv4().slice(0, 16);
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, trimmedEmail, passwordHash, fullName.trim(), role);

  const defaultBrand = db.prepare(`SELECT id FROM brands LIMIT 1`).get() as any;
  if (defaultBrand) {
    db.prepare(`
      INSERT INTO brand_members (id, brand_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), defaultBrand.id, userId, role);
  }

  recordAuditLog({
    userId: req.user?.id,
    action: 'ADMIN_PROVISIONED_USER',
    metadata: { provisionedUserId: userId, email: trimmedEmail, assignedRole: role }
  });

  res.status(201).json({
    message: `User ${fullName} successfully provisioned with role ${role}`,
    user: { id: userId, email: trimmedEmail, fullName: fullName.trim(), role }
  });
}

// Deprecated Role Switcher (Retires insecure persona switching)
export function switchDemoRole(_req: Request, res: Response): void {
  res.status(403).json({
    error: 'Demo role switcher has been retired. Please log in directly with your registered credentials.'
  });
}
