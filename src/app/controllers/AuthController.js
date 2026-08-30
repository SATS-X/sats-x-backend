import bcrypt from 'bcrypt';
import prisma from '../../config/db/index.js';
import {
    BCRYPT_ROUNDS,
    REFRESH_COOKIE_NAME,
    REFRESH_TOKEN_TTL_DAYS,
    hashToken,
    refreshCookieOptions,
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken
} from '../../config/auth.js';

// Cột được phép trả về cho client. passwordHash không bao giờ xuất hiện ở đây.
const PUBLIC_SELECT = {
    teacherId: true,
    fullName: true,
    email: true,
    phoneNumber: true,
    role: true,
    birthdate: true,
    address: true,
    position: true,
    department: true,
    experience: true,
    education: true,
    lastLoginAt: true
};

/** Prisma trả camelCase, nhưng hợp đồng API với frontend là snake_case. */
const toPublicTeacher = (t) => ({
    teacher_id: t.teacherId,
    full_name: t.fullName,
    email: t.email,
    phone_number: t.phoneNumber,
    role: t.role,
    birthdate: t.birthdate ? t.birthdate.toISOString().slice(0, 10) : null,
    address: t.address,
    position: t.position,
    department: t.department,
    experience: t.experience,
    education: t.education,
    last_login_at: t.lastLoginAt
});

// Hash giả để bcrypt.compare vẫn chạy khi không tìm thấy email,
// giữ thời gian phản hồi đồng đều nên kẻ tấn công không dò được email nào tồn tại.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.mVprFLPvFJ4pJDcqSLh0lZDcfXjSj7y';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isStrongPassword = (pw) =>
    typeof pw === 'string' && pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);

const fail = (res, status, error, message) =>
    res.status(status).json({ success: false, error, message });

/** Cấp cặp token mới và ghi refresh token (đã hash) xuống DB. */
const issueSession = async (res, teacher, userAgent) => {
    const accessToken = signAccessToken({ teacher_id: teacher.teacherId, role: teacher.role });
    const { token: refreshToken } = signRefreshToken({ teacher_id: teacher.teacherId });

    await prisma.refreshToken.create({
        data: {
            teacherId: teacher.teacherId,
            tokenHash: hashToken(refreshToken),
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
            userAgent: (userAgent || '').slice(0, 255) || null
        }
    });

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    return accessToken;
};

/**
 * POST /api/auth/activate
 * Kích hoạt lần đầu cho giáo viên đã có sẵn trong bảng teacher nhưng chưa có mật khẩu.
 * Không tạo tài khoản mới — đây là lý do endpoint này mở công khai được:
 * người lạ không tự tạo được tài khoản, chỉ đặt mật khẩu cho bản ghi already exists.
 */
export const activate = async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (!email || !EMAIL_RE.test(email)) {
            return fail(res, 400, 'ValidationError', 'Invalid email address');
        }

        if (!isStrongPassword(password)) {
            return fail(res, 400, 'ValidationError', 'Password must be at least 8 characters and contain letters and numbers');
        }

        const teacher = await prisma.teacher.findUnique({
            where: { email },
            select: { teacherId: true, passwordHash: true, isActive: true }
        });

        // Thông báo giống hệt nhau ở mọi nhánh thất bại để không lộ email nào có trong hệ thống.
        const generic = 'Activation failed. The account does not exist or is already active.';

        if (!teacher || !teacher.isActive || teacher.passwordHash !== null) {
            return fail(res, 400, 'ActivationFailed', generic);
        }

        await prisma.teacher.update({
            where: { teacherId: teacher.teacherId },
            data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) }
        });

        return res.status(200).json({
            success: true,
            message: 'Account activated successfully. You can now sign in.'
        });
    } catch (error) {
        console.error('Error in activate:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/**
 * POST /api/auth/register  (chỉ admin)
 * Tạo giáo viên mới kèm mật khẩu.
 */
export const register = async (req, res) => {
    try {
        const { teacher_id, full_name, email, phone_number, password, role } = req.body || {};

        if (!teacher_id || !full_name || !email) {
            return fail(res, 400, 'ValidationError', 'Missing teacher_id, full_name, or email');
        }

        if (!EMAIL_RE.test(email)) {
            return fail(res, 400, 'ValidationError', 'Invalid email address');
        }

        if (!isStrongPassword(password)) {
            return fail(res, 400, 'ValidationError', 'Password must be at least 8 characters and contain letters and numbers');
        }

        if (role && !['teacher', 'admin'].includes(role)) {
            return fail(res, 400, 'ValidationError', 'Role must be either "teacher" or "admin"');
        }

        const created = await prisma.teacher.create({
            data: {
                teacherId: teacher_id,
                fullName: full_name,
                email,
                phoneNumber: phone_number || null,
                passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
                role: role || 'teacher'
            },
            select: PUBLIC_SELECT
        });

        return res.status(201).json({
            success: true,
            message: 'Teacher account created successfully',
            data: toPublicTeacher(created)
        });
    } catch (error) {
        if (error.code === 'P2002') {
            return fail(res, 409, 'DuplicateEntry', 'teacher_id or email already exists');
        }
        console.error('Error in register:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** POST /api/auth/login */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return fail(res, 400, 'ValidationError', 'Missing email or password');
        }

        const teacher = await prisma.teacher.findUnique({
            where: { email },
            select: { ...PUBLIC_SELECT, passwordHash: true, isActive: true }
        });

        // Luôn chạy bcrypt.compare, kể cả khi không có user, để thời gian phản hồi không đổi.
        const ok = await bcrypt.compare(password, teacher?.passwordHash || DUMMY_HASH);

        if (!teacher || !ok || !teacher.isActive || !teacher.passwordHash) {
            return fail(res, 401, 'InvalidCredentials', 'Incorrect email or password');
        }

        const accessToken = await issueSession(res, teacher, req.headers['user-agent']);

        const updated = await prisma.teacher.update({
            where: { teacherId: teacher.teacherId },
            data: { lastLoginAt: new Date() },
            select: PUBLIC_SELECT
        });

        return res.status(200).json({
            success: true,
            message: 'Signed in successfully',
            accessToken,
            user: toPublicTeacher(updated)
        });
    } catch (error) {
        console.error('Error in login:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/**
 * POST /api/auth/refresh
 * Xoay vòng refresh token: token cũ bị thu hồi ngay khi cấp token mới,
 * nên một token chỉ dùng được đúng một lần.
 */
export const refresh = async (req, res) => {
    try {
        const token = req.cookies?.[REFRESH_COOKIE_NAME];

        if (!token) {
            return fail(res, 401, 'Unauthorized', 'Missing refresh token');
        }

        let payload;
        try {
            payload = verifyRefreshToken(token);
        } catch {
            res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
            return fail(res, 401, 'InvalidToken', 'Refresh token is invalid or expired');
        }

        const stored = await prisma.refreshToken.findUnique({
            where: { tokenHash: hashToken(token) },
            select: { id: true, revokedAt: true, expiresAt: true }
        });

        if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
            // Token đúng chữ ký nhưng đã bị thu hồi => nhiều khả năng bị đánh cắp.
            // Thu hồi toàn bộ phiên của tài khoản này.
            if (stored?.revokedAt) {
                await prisma.refreshToken.updateMany({
                    where: { teacherId: payload.sub, revokedAt: null },
                    data: { revokedAt: new Date() }
                });
                console.warn(`Detected refresh-token reuse and revoked all sessions for ${payload.sub}`);
            }
            res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
            return fail(res, 401, 'InvalidToken', 'Refresh token is no longer valid');
        }

        const teacher = await prisma.teacher.findFirst({
            where: { teacherId: payload.sub, isActive: true },
            select: { ...PUBLIC_SELECT }
        });

        if (!teacher) {
            res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
            return fail(res, 401, 'Unauthorized', 'Account is no longer active');
        }

        await prisma.refreshToken.update({
            where: { id: stored.id },
            data: { revokedAt: new Date() }
        });

        const accessToken = await issueSession(res, teacher, req.headers['user-agent']);

        return res.status(200).json({
            success: true,
            message: 'Access token refreshed successfully',
            accessToken,
            user: toPublicTeacher(teacher)
        });
    } catch (error) {
        console.error('Error in refresh:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** POST /api/auth/logout */
export const logout = async (req, res) => {
    try {
        const token = req.cookies?.[REFRESH_COOKIE_NAME];

        if (token) {
            await prisma.refreshToken.updateMany({
                where: { tokenHash: hashToken(token), revokedAt: null },
                data: { revokedAt: new Date() }
            });
        }

        res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());

        return res.status(200).json({ success: true, message: 'Signed out successfully' });
    } catch (error) {
        console.error('Error in logout:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** GET /api/auth/me — thay cho fetchUserAttributes() của Amplify */
export const me = async (req, res) => {
    try {
        const teacher = await prisma.teacher.findUnique({
            where: { teacherId: req.user.teacher_id },
            select: PUBLIC_SELECT
        });

        if (!teacher) {
            return fail(res, 404, 'NotFound', 'Teacher not found');
        }

        return res.status(200).json({ success: true, user: toPublicTeacher(teacher) });
    } catch (error) {
        console.error('Error in me:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** PUT /api/auth/me — thay cho việc cập nhật custom attributes trên Cognito */
export const updateMe = async (req, res) => {
    try {
        // Ánh xạ cố định: khoá đến từ danh sách này, không phải từ input người dùng.
        const editable = {
            full_name: 'fullName',
            phone_number: 'phoneNumber',
            birthdate: 'birthdate',
            address: 'address',
            position: 'position',
            department: 'department',
            experience: 'experience',
            education: 'education'
        };

        const data = {};
        for (const [apiField, column] of Object.entries(editable)) {
            if (req.body?.[apiField] === undefined) continue;
            const value = req.body[apiField];

            if (column === 'birthdate') {
                if (value === '' || value === null) {
                    data.birthdate = null;
                    continue;
                }
                const parsed = new Date(value);
                if (Number.isNaN(parsed.getTime())) {
                    return fail(res, 400, 'ValidationError', 'birthdate must use the YYYY-MM-DD format');
                }
                data.birthdate = parsed;
                continue;
            }

            data[column] = value === '' ? null : value;
        }

        if (Object.keys(data).length === 0) {
            return fail(res, 400, 'ValidationError', 'No fields were provided for update');
        }

        const updated = await prisma.teacher.update({
            where: { teacherId: req.user.teacher_id },
            data,
            select: PUBLIC_SELECT
        });

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: toPublicTeacher(updated)
        });
    } catch (error) {
        console.error('Error in updateMe:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** POST /api/auth/change-password */
export const changePassword = async (req, res) => {
    try {
        const { current_password, new_password } = req.body || {};

        if (!current_password || !new_password) {
            return fail(res, 400, 'ValidationError', 'Missing current or new password');
        }

        if (!isStrongPassword(new_password)) {
            return fail(res, 400, 'ValidationError', 'New password must be at least 8 characters and contain letters and numbers');
        }

        const teacher = await prisma.teacher.findUnique({
            where: { teacherId: req.user.teacher_id },
            select: { passwordHash: true }
        });

        if (!teacher?.passwordHash) {
            return fail(res, 404, 'NotFound', 'Account not found');
        }

        if (!(await bcrypt.compare(current_password, teacher.passwordHash))) {
            return fail(res, 401, 'InvalidCredentials', 'Current password is incorrect');
        }

        // Đổi mật khẩu thì mọi phiên đăng nhập cũ phải mất hiệu lực.
        await prisma.$transaction([
            prisma.teacher.update({
                where: { teacherId: req.user.teacher_id },
                data: { passwordHash: await bcrypt.hash(new_password, BCRYPT_ROUNDS) }
            }),
            prisma.refreshToken.updateMany({
                where: { teacherId: req.user.teacher_id, revokedAt: null },
                data: { revokedAt: new Date() }
            })
        ]);

        res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());

        return res.status(200).json({
            success: true,
            message: 'Password changed successfully. Please sign in again.'
        });
    } catch (error) {
        console.error('Error in changePassword:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};
