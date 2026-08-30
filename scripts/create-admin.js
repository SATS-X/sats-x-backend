/**
 * Tạo tài khoản admin đầu tiên.
 * Vì POST /api/auth/register yêu cầu quyền admin, tài khoản admin đầu tiên
 * phải được tạo ngoài HTTP.
 *
 *   node scripts/create-admin.js <teacher_id> <full_name> <email> <password>
 *
 * Ví dụ:
 *   node scripts/create-admin.js GV001 "Tran Dai Vi" vi@satsx.dev 'MatKhau123'
 */
import bcrypt from 'bcrypt';
import prisma from '../src/config/db/index.js';
import { BCRYPT_ROUNDS } from '../src/config/auth.js';

const [teacherId, fullName, email, password] = process.argv.slice(2);

if (!teacherId || !fullName || !email || !password) {
    console.error('Usage: node scripts/create-admin.js <teacher_id> <full_name> <email> <password>');
    process.exit(1);
}

if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    console.error('Password must be at least 8 characters and contain letters and numbers.');
    process.exit(1);
}

try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const existing = await prisma.teacher.findFirst({
        where: { OR: [{ teacherId }, { email }] },
        select: { teacherId: true }
    });

    if (existing) {
        // Bản ghi giáo viên đã có sẵn — chỉ nâng quyền và đặt lại mật khẩu.
        await prisma.teacher.update({
            where: { teacherId: existing.teacherId },
            data: { passwordHash, role: 'admin', isActive: true }
        });
        console.log(`Updated existing teacher "${existing.teacherId}" as administrator.`);
    } else {
        await prisma.teacher.create({
            data: { teacherId, fullName, email, passwordHash, role: 'admin' }
        });
        console.log(`Created administrator "${teacherId}".`);
    }

    console.log(`Sign in with: ${email}`);
    await prisma.$disconnect();
    process.exit(0);
} catch (error) {
    console.error('Administrator creation failed:', error.message);
    process.exit(1);
}
