import prisma from '../../config/db/index.js';
import { paginationMeta, parsePagination } from '../helpers/pagination.js';

const fail = (res, status, error, message) =>
    res.status(status).json({ success: false, error, message });

const WITH_CLASSES_AND_SUBJECTS = {
    classes: { select: { class: { select: { classId: true, name: true } } } },
    subjects: { select: { subject: { select: { subjectId: true, name: true } } } }
};

/**
 * Giữ nguyên hình dạng cũ (chuỗi nối bằng dấu phẩy) để frontend không phải sửa.
 * Bản MySQL cũ LEFT JOIN đồng thời class_student và subject_student, tạo tích
 * Descartes rồi dùng DISTINCT che đi; ở đây hai quan hệ được nạp tách biệt.
 */
const toStudentRow = (s) => {
    const classes = s.classes.map((c) => c.class).sort((a, b) => a.classId.localeCompare(b.classId));
    const subjects = s.subjects.map((x) => x.subject).sort((a, b) => a.subjectId.localeCompare(b.subjectId));

    return {
        student_id: s.studentId,
        full_name: s.fullName,
        email: s.email,
        phone_number: s.phoneNumber,
        status: s.status,
        class_ids: classes.map((c) => c.classId).join(',') || null,
        class_names: classes.map((c) => c.name).join(',') || null,
        subject_ids: subjects.map((x) => x.subjectId).join(',') || null,
        subject_names: subjects.map((x) => x.name).join(',') || null
    };
};

/** GET /api/student — hỗ trợ ?page=&limit= */
export const getAllStudents = async (req, res) => {
    try {
        const pagination = parsePagination(req.query);

        const [students, total] = await Promise.all([
            prisma.student.findMany({
                include: WITH_CLASSES_AND_SUBJECTS,
                orderBy: { studentId: 'asc' },
                ...(pagination.enabled ? { skip: pagination.skip, take: pagination.take } : {})
            }),
            pagination.enabled ? prisma.student.count() : Promise.resolve(null)
        ]);

        const data = students.map(toStudentRow);

        return res.status(200).json({
            success: true,
            message: 'Students retrieved successfully',
            data,
            count: data.length,
            ...paginationMeta(pagination, total)
        });
    } catch (error) {
        console.error('Error in getAllStudents:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** GET /api/student/class/:class_id */
export const getAllStudentsByClassId = async (req, res) => {
    try {
        const { class_id } = req.params;

        if (!class_id) {
            return fail(res, 400, 'ValidationError', 'Missing class_id parameter');
        }

        const students = await prisma.student.findMany({
            where: { classes: { some: { classId: class_id } } },
            include: WITH_CLASSES_AND_SUBJECTS,
            orderBy: { studentId: 'asc' }
        });

        const data = students.map(toStudentRow);

        return res.status(200).json({
            success: true,
            message: `Students for class ${class_id} retrieved successfully`,
            data,
            count: data.length,
            class_id
        });
    } catch (error) {
        console.error('Error in getAllStudentsByClassId:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** GET /api/student/subject/:subject_id */
export const getAllStudentsBySubjectId = async (req, res) => {
    try {
        const { subject_id } = req.params;

        if (!subject_id) {
            return fail(res, 400, 'ValidationError', 'Missing subject_id parameter');
        }

        const students = await prisma.student.findMany({
            where: { subjects: { some: { subjectId: subject_id } } },
            include: WITH_CLASSES_AND_SUBJECTS,
            orderBy: { fullName: 'asc' }
        });

        const data = students.map(toStudentRow);

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

/**
 * POST /api/student
 * Chỉ tạo bản ghi trong DB — KHÔNG đăng ký khuôn mặt (việc đó qua WebSocket
 * addFace riêng, xem AddFaceModal.jsx). classId tuỳ chọn: có thì gán luôn vào
 * lớp, tiện cho luồng "thêm sinh viên mới" từ trang quản lý lớp.
 */
export const createStudent = async (req, res) => {
    try {
        const { student_id, full_name, email, phone_number, status, class_id } = req.body || {};

        if (!student_id || !full_name) {
            return fail(res, 400, 'ValidationError', 'Missing student_id or full_name');
        }

        const student = await prisma.student.create({
            data: {
                studentId: student_id,
                fullName: full_name,
                email: email || null,
                phoneNumber: phone_number || null,
                status: status || 'active',
                ...(class_id ? { classes: { create: { classId: class_id } } } : {})
            },
            include: WITH_CLASSES_AND_SUBJECTS
        });

        return res.status(201).json({
            success: true,
            message: 'Student created successfully',
            data: toStudentRow(student)
        });
    } catch (error) {
        if (error.code === 'P2002') {
            return fail(res, 409, 'DuplicateEntry', `Student ID ${req.body?.student_id} already exists`);
        }
        if (error.code === 'P2003') {
            return fail(res, 404, 'ClassNotFound', `Class not found: ${req.body?.class_id}`);
        }
        console.error('Error in createStudent:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** PUT /api/student/:student_id — chỉ sửa thông tin cá nhân, không đổi mã SV (khoá chính). */
export const updateStudent = async (req, res) => {
    try {
        const { student_id } = req.params;
        // Tên cột lấy từ map cố định này, không phải từ input người dùng.
        const fieldMap = { full_name: 'fullName', email: 'email', phone_number: 'phoneNumber', status: 'status' };

        const data = {};
        for (const [apiField, column] of Object.entries(fieldMap)) {
            if (req.body?.[apiField] !== undefined) {
                data[column] = req.body[apiField] === '' ? null : req.body[apiField];
            }
        }

        if (Object.keys(data).length === 0) {
            return fail(res, 400, 'ValidationError', 'No fields were provided for update');
        }

        const student = await prisma.student.update({
            where: { studentId: student_id },
            data,
            include: WITH_CLASSES_AND_SUBJECTS
        });

        return res.status(200).json({
            success: true,
            message: 'Student updated successfully',
            data: toStudentRow(student)
        });
    } catch (error) {
        if (error.code === 'P2025') {
            return fail(res, 404, 'NotFound', `Student not found: ${req.params.student_id}`);
        }
        console.error('Error in updateStudent:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/**
 * DELETE /api/student/:student_id
 * Cascade xoá luôn: liên kết lớp/môn học VÀ toàn bộ lịch sử điểm danh của sinh
 * viên này (xem schema.prisma: Attendance.student onDelete: Cascade). Frontend
 * đã cảnh báo "xoá khỏi lớp và môn học" — thực tế còn mất cả lịch sử điểm danh.
 */
export const deleteStudent = async (req, res) => {
    try {
        const { student_id } = req.params;

        await prisma.student.delete({ where: { studentId: student_id } });

        return res.status(200).json({
            success: true,
            message: `Deleted student ${student_id}`
        });
    } catch (error) {
        if (error.code === 'P2025') {
            return fail(res, 404, 'NotFound', `Student not found: ${req.params.student_id}`);
        }
        console.error('Error in deleteStudent:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};
