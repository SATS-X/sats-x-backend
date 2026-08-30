import { timingSafeEqual, createHash } from 'crypto';
import { verifyAccessToken } from '../../config/auth.js';

/**
 * Chặn mọi request không mang access token hợp lệ.
 * Gắn req.user = { teacher_id, role } cho controller phía sau dùng.
 */
export const requireAuth = (req, res, next) => {
    const header = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Missing access token'
        });
    }

    const token = header.slice(7).trim();

    try {
        const payload = verifyAccessToken(token);
        req.user = { teacher_id: payload.sub, role: payload.role };
        return next();
    } catch (error) {
        // Phân biệt hết hạn với token sai, để frontend biết khi nào nên gọi /refresh.
        const expired = error.name === 'TokenExpiredError';
        return res.status(401).json({
            success: false,
            error: expired ? 'TokenExpired' : 'InvalidToken',
            message: expired ? 'Access token has expired' : 'Invalid access token'
        });
    }
};

/** Chỉ cho phép role nằm trong danh sách. Dùng sau requireAuth. */
export const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Authentication required'
        });
    }

    if (!roles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Insufficient permissions'
        });
    }

    return next();
};

/**
 * Xác thực máy-với-máy cho Lambda gọi vào (thiết bị IoT không có JWT giáo viên).
 * So sánh bằng timingSafeEqual trên digest SHA-256 — độ dài chuỗi gốc khác nhau
 * vẫn so sánh được (timingSafeEqual yêu cầu 2 buffer bằng độ dài) và không lộ
 * thời gian so khớp theo từng ký tự.
 */
export const requireServiceToken = (req, res, next) => {
    const expected = process.env.SERVICE_TOKEN;

    if (!expected) {
        console.error('SERVICE_TOKEN is not configured in .env; all device requests will be rejected');
        return res.status(500).json({
            success: false,
            error: 'ServerMisconfigured',
            message: 'SERVICE_TOKEN is not configured on the server'
        });
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    const tokenDigest = createHash('sha256').update(token).digest();
    const expectedDigest = createHash('sha256').update(expected).digest();

    if (!token || !timingSafeEqual(tokenDigest, expectedDigest)) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Invalid service token'
        });
    }

    return next();
};

/**
 * Chặn giáo viên đọc dữ liệu của giáo viên khác qua :teacher_id trên URL.
 * Admin thì bỏ qua.
 */
export const requireSelfOrAdmin = (paramName = 'teacher_id') => (req, res, next) => {
    if (req.user?.role === 'admin') {
        return next();
    }

    if (String(req.params[paramName]) !== String(req.user?.teacher_id)) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'You can only access your own data'
        });
    }

    return next();
};
