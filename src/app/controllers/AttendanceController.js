import prisma from '../../config/db/index.js';
import { paginationMeta, parsePagination } from '../helpers/pagination.js';

const fail = (res, status, error, message) =>
    res.status(status).json({ success: false, error, message });

// Mọi query điểm danh đều sắp xếp mới nhất trước.
const NEWEST_FIRST = [
    { year: 'desc' },
    { month: 'desc' },
    { day: 'desc' },
    { time: 'desc' }
];

// Lấy kèm tên sinh viên, tên môn và danh sách lớp trong đúng một truy vấn.
// Bản MySQL cũ dùng subquery tương quan chạy lại cho từng dòng; include của
// Prisma gom lại thành một lần nạp quan hệ.
const WITH_RELATIONS = {
    student: {
        select: {
            fullName: true,
            classes: { select: { class: { select: { classId: true, name: true } } } }
        }
    },
    subject: { select: { name: true } }
};

/**
 * Giữ nguyên hình dạng cũ: class_ids / class_names là chuỗi nối bằng dấu phẩy,
 * vì frontend đang làm record.class_names.split(',').
 */
const toAttendanceRow = (a) => {
    const classes = (a.student?.classes || []).map((c) => c.class).sort((x, y) => x.classId.localeCompare(y.classId));

    return {
        time: a.time,
        day: a.day,
        month: a.month,
        year: a.year,
        day_of_week: a.dayOfWeek,
        student_id: a.studentId,
        student_name: a.student?.fullName ?? null,
        subject_id: a.subjectId,
        subject_name: a.subject?.name ?? null,
        status: a.status,
        remark: a.remark,
        image_key: a.imageKey,
        class_ids: classes.map((c) => c.classId).join(',') || null,
        class_names: classes.map((c) => c.name).join(',') || null
    };
};

/** GET /api/attendance — hỗ trợ ?page=&limit= (không truyền thì trả toàn bộ) */
export const getAllAttendance = async (req, res) => {
    try {
        const pagination = parsePagination(req.query);

        const [records, total] = await Promise.all([
            prisma.attendance.findMany({
                include: WITH_RELATIONS,
                orderBy: NEWEST_FIRST,
                ...(pagination.enabled ? { skip: pagination.skip, take: pagination.take } : {})
            }),
            pagination.enabled ? prisma.attendance.count() : Promise.resolve(null)
        ]);

        const data = records.map(toAttendanceRow);

        return res.status(200).json({
            success: true,
            message: 'All attendance records retrieved successfully',
            data,
            count: data.length,
            ...paginationMeta(pagination, total)
        });
    } catch (error) {
        console.error('Error in getAllAttendance:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** GET /api/attendance/class/:class_id */
export const getAllAttendanceByClassId = async (req, res) => {
    try {
        const { class_id } = req.params;

        if (!class_id) {
            return fail(res, 400, 'ValidationError', 'Missing class_id parameter');
        }

        const pagination = parsePagination(req.query);
        const where = { student: { classes: { some: { classId: class_id } } } };

        const [records, total] = await Promise.all([
            prisma.attendance.findMany({
                where,
                include: WITH_RELATIONS,
                orderBy: NEWEST_FIRST,
                ...(pagination.enabled ? { skip: pagination.skip, take: pagination.take } : {})
            }),
            pagination.enabled ? prisma.attendance.count({ where }) : Promise.resolve(null)
        ]);

        const data = records.map(toAttendanceRow);

        return res.status(200).json({
            success: true,
            message: `Attendance records for class ${class_id} retrieved successfully`,
            data,
            count: data.length,
            // Bản cũ trả parseInt(class_id) — sai, vì mã lớp là chuỗi kiểu "D22CQCI01-N".
            class_id,
            ...paginationMeta(pagination, total)
        });
    } catch (error) {
        console.error('Error in getAllAttendanceByClassId:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/**
 * GET /api/attendance/subject/:subject_id
 * Thống kê chuyên cần của từng sinh viên trong một môn.
 */
export const getAllStudentsBySubjectId = async (req, res) => {
    try {
        const { subject_id } = req.params;

        if (!subject_id) {
            return fail(res, 400, 'ValidationError', 'Missing subject_id parameter');
        }

        const subject = await prisma.subject.findUnique({
            where: { subjectId: subject_id },
            select: { name: true }
        });

        if (!subject) {
            return fail(res, 404, 'NotFound', `Subject not found: ${subject_id}`);
        }

        // Gom nhóm ngay trong DB thay vì kéo hết bản ghi về rồi đếm bằng JS.
        const grouped = await prisma.attendance.groupBy({
            by: ['studentId'],
            where: { subjectId: subject_id },
            _count: { _all: true },
            _sum: { status: true }
        });

        if (grouped.length === 0) {
            return res.status(200).json({
                success: true,
                message: `Students for subject ${subject_id} retrieved successfully`,
                data: [],
                count: 0,
                subject_id
            });
        }

        const students = await prisma.student.findMany({
            where: { studentId: { in: grouped.map((g) => g.studentId) } },
            select: { studentId: true, fullName: true, email: true, phoneNumber: true }
        });

        const byId = new Map(students.map((s) => [s.studentId, s]));

        const data = grouped
            .map((g) => {
                const student = byId.get(g.studentId);
                const total = g._count._all;
                const present = g._sum.status ?? 0;

                return {
                    student_id: g.studentId,
                    student_name: student?.fullName ?? null,
                    email: student?.email ?? null,
                    phone_number: student?.phoneNumber ?? null,
                    subject_name: subject.name,
                    total_sessions: total,
                    present_sessions: present,
                    absent_sessions: total - present,
                    // Chia số thực rồi mới làm tròn. Bản MySQL cũ chuyển sang Postgres
                    // sẽ ra 0 vì phép chia hai số nguyên bị cắt phần thập phân.
                    attendance_percentage: total > 0 ? Math.round((present / total) * 10000) / 100 : 0
                };
            })
            .sort((a, b) => (a.student_name || '').localeCompare(b.student_name || ''));

        return res.status(200).json({
            success: true,
            message: `Students for subject ${subject_id} retrieved successfully`,
            data,
            count: data.length,
            subject_id
        });
    } catch (error) {
        console.error('Error in getAllStudentsBySubjectId:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** GET /api/attendance/student/:student_id */
export const getAllAttendanceByStudentId = async (req, res) => {
    try {
        const { student_id } = req.params;

        if (!student_id) {
            return fail(res, 400, 'ValidationError', 'Missing student_id parameter');
        }

        const student = await prisma.student.findUnique({
            where: { studentId: student_id },
            select: { studentId: true, fullName: true, email: true }
        });

        if (!student) {
            return res.status(404).json({
                success: false,
                error: 'Student not found',
                student_id
            });
        }

        const records = await prisma.attendance.findMany({
            where: { studentId: student_id },
            include: WITH_RELATIONS,
            orderBy: NEWEST_FIRST
        });

        const attendanceRecords = records.map(toAttendanceRow);

        const totalSessions = attendanceRecords.length;
        const presentSessions = attendanceRecords.filter((r) => r.status === 1).length;

        return res.status(200).json({
            success: true,
            message: `Attendance records for student ${student_id} retrieved successfully`,
            student: {
                student_id: student.studentId,
                full_name: student.fullName,
                email: student.email
            },
            attendance_records: attendanceRecords,
            statistics: {
                total_sessions: totalSessions,
                present_sessions: presentSessions,
                absent_sessions: totalSessions - presentSessions,
                attendance_percentage:
                    totalSessions > 0 ? Math.round((presentSessions / totalSessions) * 10000) / 100 : 0
            }
        });
    } catch (error) {
        console.error('Error in getAllAttendanceByStudentId:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};
