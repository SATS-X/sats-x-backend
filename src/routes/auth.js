import express from 'express';
import rateLimit from 'express-rate-limit';
import {
    activate,
    changePassword,
    login,
    logout,
    me,
    refresh,
    register,
    updateMe
} from '../app/controllers/AuthController.js';
import { requireAuth, requireRole } from '../app/middlewares/authMiddleware.js';

const router = express.Router();

// Chống dò mật khẩu: 10 lần thử / 15 phút / IP.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        error: 'TooManyRequests',
        message: 'Too many failed sign-in attempts. Try again in 15 minutes.'
    }
});

// Công khai
router.post('/login', loginLimiter, login);
router.post('/activate', loginLimiter, activate);
router.post('/refresh', refresh);
router.post('/logout', logout);

// Cần đăng nhập
router.get('/me', requireAuth, me);
router.put('/me', requireAuth, updateMe);
router.post('/change-password', requireAuth, changePassword);

// Chỉ admin
router.post('/register', requireAuth, requireRole('admin'), register);

export default router;
