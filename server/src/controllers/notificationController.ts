import { Response } from 'express';
import db from '../db/connection.js';
import { AuthRequest } from '../middleware/auth.js';

export function getUserNotifications(req: AuthRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const notifications = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.user.id);

  res.json({ notifications });
}

export function markNotificationRead(req: AuthRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { id } = req.params;
  db.prepare(`
    UPDATE notifications
    SET is_read = 1
    WHERE id = ? AND user_id = ?
  `).run(id, req.user.id);

  res.json({ success: true, id });
}

