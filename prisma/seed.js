/**
 * Dữ liệu mẫu để chạy thử và kiểm thử.
 *   node prisma/seed.js
 *
 * Script chạy lại được nhiều lần (dùng upsert), không nhân bản dữ liệu.
 */
import bcrypt from 'bcrypt';
import prisma from '../src/config/db/index.js';
import { BCRYPT_ROUNDS } from '../src/config/auth.js';

const CLASS_ID = 'D22CQCI01-N';
const SUBJECT_ID = 'INT1449';

const run = async () => {
    const passwordHash = await bcrypt.hash('MatKhau123', BCRYPT_ROUNDS);

    const teacher = await prisma.teacher.upsert({
        where: { email: 'instructor@satsx.dev' },
        update: {},
        create: {
            teacherId: 'GV002',
            fullName: 'Nguyen Van Minh',
            email: 'instructor@satsx.dev',
            phoneNumber: '0912345678',
            passwordHash,
            role: 'teacher',
            position: 'Giang vien',
            department: 'Cong nghe thong tin'
        }
    });

    // Một giáo viên chưa đặt mật khẩu, để thử luồng /api/auth/activate.
    await prisma.teacher.upsert({
        where: { email: 'invited@satsx.dev' },
        update: {},
        create: {
            teacherId: 'GV003',
            fullName: 'Le Thi Hoa',
            email: 'invited@satsx.dev',
            passwordHash: null
        }
    });

    await prisma.class.upsert({
        where: { classId: CLASS_ID },
        update: {},
        create: { classId: CLASS_ID, name: 'CNTT K22 - Nhom N', numberOfStudents: 3 }
    });

    await prisma.subject.upsert({
        where: { subjectId: SUBJECT_ID },
        update: {},
        create: { subjectId: SUBJECT_ID, name: 'He thong nhung', teacherId: teacher.teacherId }
    });

    await prisma.subjectClass.upsert({
        where: { subjectId_classId: { subjectId: SUBJECT_ID, classId: CLASS_ID } },
        update: {},
        create: { subjectId: SUBJECT_ID, classId: CLASS_ID }
    });

    const students = [
        { studentId: 'N22DCCN001', fullName: 'Tran Dai Vi', email: 'vi@students.satsx.dev' },
        { studentId: 'N22DCCN002', fullName: 'Pham Minh Anh', email: 'anh@students.satsx.dev' },
        { studentId: 'N22DCCN003', fullName: 'Do Quoc Bao', email: 'bao@students.satsx.dev' }
    ];

    for (const s of students) {
        await prisma.student.upsert({ where: { studentId: s.studentId }, update: {}, create: s });

        await prisma.classStudent.upsert({
            where: { classId_studentId: { classId: CLASS_ID, studentId: s.studentId } },
            update: {},
            create: { classId: CLASS_ID, studentId: s.studentId }
        });

        await prisma.subjectStudent.upsert({
            where: { subjectId_studentId: { subjectId: SUBJECT_ID, studentId: s.studentId } },
            update: {},
            create: { subjectId: SUBJECT_ID, studentId: s.studentId }
        });
    }

    await prisma.schedule.deleteMany({ where: { subjectId: SUBJECT_ID } });
    await prisma.schedule.create({
        data: {
            subjectId: SUBJECT_ID,
            teacherId: teacher.teacherId,
            day: 20,
            month: 8,
            year: 2026,
            dayOfWeek: 'Thursday',
            room: 'A2-401',
            startTime: '07:30',
            endTime: '09:30'
        }
    });

    // Điểm danh: Vi đúng giờ, Anh trễ, Bao vắng — đủ ba trạng thái để kiểm tra thống kê.
    await prisma.attendance.deleteMany({ where: { subjectId: SUBJECT_ID } });
    await prisma.attendance.createMany({
        data: [
            { studentId: 'N22DCCN001', subjectId: SUBJECT_ID, time: '07:28', day: 20, month: 8, year: 2026, dayOfWeek: 'Thursday', status: 1, remark: 'On Time' },
            { studentId: 'N22DCCN002', subjectId: SUBJECT_ID, time: '07:45', day: 20, month: 8, year: 2026, dayOfWeek: 'Thursday', status: 1, remark: 'Late' },
            { studentId: 'N22DCCN003', subjectId: SUBJECT_ID, time: '00:00', day: 20, month: 8, year: 2026, dayOfWeek: 'Thursday', status: 0, remark: 'Absent' },
            { studentId: 'N22DCCN001', subjectId: SUBJECT_ID, time: '07:31', day: 13, month: 8, year: 2026, dayOfWeek: 'Thursday', status: 1, remark: 'On Time' },
            { studentId: 'N22DCCN002', subjectId: SUBJECT_ID, time: '00:00', day: 13, month: 8, year: 2026, dayOfWeek: 'Thursday', status: 0, remark: 'Absent' }
        ]
    });

    console.log('Seed xong.');
    console.log(`  Activated teacher: instructor@satsx.dev / MatKhau123 (${teacher.teacherId})`);
    console.log('  Invited teacher: invited@satsx.dev (GV003)');
};

run()
    .catch((error) => {
        console.error('Database seed failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
