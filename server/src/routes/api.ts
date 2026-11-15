import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, requireRole } from '../middleware/auth.js';
import * as authCtrl from '../controllers/authController.js';
import * as brandCtrl from '../controllers/brandController.js';
import * as contentCtrl from '../controllers/contentController.js';
import * as documentCtrl from '../controllers/documentController.js';
import * as scanCtrl from '../controllers/scanController.js';
import * as correctionCtrl from '../controllers/correctionController.js';
import * as reviewCtrl from '../controllers/reviewController.js';
import * as analyticsCtrl from '../controllers/analyticsController.js';
import * as auditCtrl from '../controllers/auditController.js';
import * as notifCtrl from '../controllers/notificationController.js';

const router = Router();

// Configure secure Multer storage (supports Railway volume uploads)
const uploadDir = process.env.UPLOAD_DIR
  ? (path.isAbsolute(process.env.UPLOAD_DIR) ? process.env.UPLOAD_DIR : path.resolve(process.cwd(), process.env.UPLOAD_DIR))
  : path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.txt', '.md', '.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp'
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // Security 3.3: Strict sanitization and path traversal prevention
    const safeBase = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${safeBase}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error(`Security policy: Extension '${ext}' is not permitted. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`));
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`Security policy: MIME type '${file.mimetype}' is not permitted.`));
    }
    cb(null, true);
  }
});

// 1. Authentication
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', authenticate, authCtrl.getMe);
router.post('/auth/switch-role', authCtrl.switchDemoRole);
router.post('/auth/admin/users', authenticate, requireRole('BRAND_ADMIN'), authCtrl.adminCreateUser);

// 2. Brand Knowledge Management
router.get('/brands/knowledge', authenticate, brandCtrl.getBrandKnowledge);
router.post('/brands/guidelines', authenticate, requireRole('BRAND_ADMIN'), brandCtrl.createGuideline);
router.put('/brands/guidelines/:id', authenticate, requireRole('BRAND_ADMIN'), brandCtrl.updateGuideline);
router.post('/brands/terminology', authenticate, requireRole('BRAND_ADMIN'), brandCtrl.addTerminologyRule);
router.put('/brands/terminology/:id', authenticate, requireRole('BRAND_ADMIN'), brandCtrl.updateTerminologyRule);
router.patch('/brands/terminology/:id/toggle-active', authenticate, requireRole('BRAND_ADMIN'), brandCtrl.toggleTerminologyStatus);
router.post('/brands/approved-facts', authenticate, requireRole('BRAND_ADMIN'), brandCtrl.addApprovedFact);
router.post('/brands/approved-facts/bulk-import', authenticate, requireRole('BRAND_ADMIN'), brandCtrl.bulkImportApprovedFacts);
router.post('/brands/voice-rules', authenticate, requireRole('BRAND_ADMIN'), brandCtrl.addVoiceRule);
router.put('/brands/voice-rules/:id', authenticate, requireRole('BRAND_ADMIN'), brandCtrl.updateVoiceRule);
router.patch('/brands/voice-rules/:id/toggle-status', authenticate, requireRole('BRAND_ADMIN'), brandCtrl.toggleVoiceRuleStatus);
router.post('/brands/assets', authenticate, requireRole('BRAND_ADMIN'), brandCtrl.addBrandAsset);
router.post('/brands/assets/validate-draft', authenticate, brandCtrl.validateDraftAsset);

// 3. Content Submissions
router.get('/content', authenticate, contentCtrl.getSubmissions);
router.get('/content/:id', authenticate, contentCtrl.getSubmissionDetail);
router.post('/content', authenticate, contentCtrl.createSubmission);
router.post('/content/:id/resubmit', authenticate, contentCtrl.resubmitRevised);
router.post('/content/:id/submit', authenticate, contentCtrl.submitForReview);
router.post('/content/:id/restore-version', authenticate, contentCtrl.restoreVersion);

// 4. Document Processing
router.post('/documents/upload', authenticate, upload.single('file'), documentCtrl.uploadDocument);

// 5. AI Scanning
router.post('/scans/run', authenticate, scanCtrl.runScan);
router.get('/scans/:id', authenticate, scanCtrl.getScanDetail);

// 6. Correction Suggestions
router.post('/suggestions/:id/accept', authenticate, correctionCtrl.acceptSuggestion);
router.post('/suggestions/:id/dismiss', authenticate, correctionCtrl.dismissSuggestion);
router.post('/suggestions/:id/edit', authenticate, correctionCtrl.editSuggestion);

// 7. Reviewer Console
router.get('/reviews/queue', authenticate, requireRole('HUMAN_REVIEWER', 'BRAND_ADMIN'), reviewCtrl.getReviewQueue);
router.post('/reviews/:id/comment', authenticate, reviewCtrl.addComment);
router.post('/reviews/:id/approve', authenticate, requireRole('HUMAN_REVIEWER', 'BRAND_ADMIN'), reviewCtrl.approveContent);
router.post('/reviews/:id/reject', authenticate, requireRole('HUMAN_REVIEWER', 'BRAND_ADMIN'), reviewCtrl.rejectContent);
router.post('/reviews/:id/request-changes', authenticate, requireRole('HUMAN_REVIEWER', 'BRAND_ADMIN'), reviewCtrl.requestChanges);
router.post('/reviews/:id/escalate', authenticate, requireRole('HUMAN_REVIEWER', 'BRAND_ADMIN'), reviewCtrl.escalateContent);

// 8. Analytics
router.get('/analytics/overview', authenticate, analyticsCtrl.getOverviewAnalytics);

// 9. Audit Logs
router.get('/audit-logs', authenticate, auditCtrl.getAuditLogs);
router.get('/audit', authenticate, auditCtrl.getAuditLogs);

// 10. Notifications
router.get('/notifications', authenticate, notifCtrl.getUserNotifications);
router.patch('/notifications/:id/read', authenticate, notifCtrl.markNotificationRead);

export default router;

