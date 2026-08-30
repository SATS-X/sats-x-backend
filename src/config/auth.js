import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// Không cho server chạy với secret rỗng hoặc secret mặc định.
if (!ACCESS_SECRET || !REFRESH_SECRET) {
    throw new Error(
        'Missing JWT_ACCESS_SECRET or JWT_REFRESH_SECRET in .env. ' +
        'Generate a secret with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
}

if (ACCESS_SECRET === REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
}

if (ACCESS_SECRET.length < 32 || REFRESH_SECRET.length < 32) {
    throw new Error('JWT secrets must be at least 32 characters long');
}

export const BCRYPT_ROUNDS = 12;

export const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TTL || '15m';
export const REFRESH_TOKEN_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS || 7);

const ISSUER = 'attendance-system';

/**
 * Access token — sống ngắn, frontend giữ trong bộ nhớ (không phải localStorage).
 * Payload cố tình tối giản: chỉ những gì middleware cần để phân quyền.
 */
export const signAccessToken = (teacher) =>
    jwt.sign(
        {
            sub: teacher.teacher_id,
            role: teacher.role || 'teacher'
        },
        ACCESS_SECRET,
        {
            expiresIn: ACCESS_TOKEN_TTL,
            issuer: ISSUER,
            audience: 'access'
        }
    );

/**
 * Refresh token — sống dài, chỉ đi qua httpOnly cookie.
 * jti cho phép thu hồi từng token một qua bảng refresh_token.
 */
export const signRefreshToken = (teacher) => {
    const jti = crypto.randomUUID();
    const token = jwt.sign({ sub: teacher.teacher_id, jti }, REFRESH_SECRET, {
        expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`,
        issuer: ISSUER,
        audience: 'refresh'
    });
    return { token, jti };
};

export const verifyAccessToken = (token) =>
    jwt.verify(token, ACCESS_SECRET, { issuer: ISSUER, audience: 'access' });

export const verifyRefreshToken = (token) =>
    jwt.verify(token, REFRESH_SECRET, { issuer: ISSUER, audience: 'refresh' });

/** Refresh token lưu xuống DB dưới dạng SHA-256 để rò rỉ DB không tái sử dụng được. */
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const refreshCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
});

export const REFRESH_COOKIE_NAME = 'refresh_token';
