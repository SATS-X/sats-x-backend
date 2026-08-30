import prisma from '../../config/db/index.js';

const fail = (res, status, error, message) =>
    res.status(status).json({ success: false, error, message });

/** GET /api/class */
export const getAllClasses = async (req, res) => {
    try {
        const classes = await prisma.class.findMany({
            include: { _count: { select: { students: true } } },
            orderBy: { classId: 'asc' }
        });

        const data = classes.map((c) => ({
            class_id: c.classId,
            class_name: c.name,
            number_of_students: c.numberOfStudents,
            status: c.status,
            // Số sinh viên thực tế trong class_student, có thể lệch với cột
            // number_of_students nếu cột đó chưa được cập nhật.
            actual_student_count: c._count.students
        }));

        return res.status(200).json({
            success: true,
            message: 'Classes retrieved successfully',
            data,
            count: data.length
        });
    } catch (error) {
        console.error('Error in getAllClasses:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** GET /api/class/:class_id */
export const getClassById = async (req, res) => {
    try {
        const { class_id } = req.params;

        const cls = await prisma.class.findUnique({
            where: { classId: class_id },
            include: {
                _count: { select: { students: true } },
                subjects: { select: { subject: { select: { subjectId: true, name: true } } } }
            }
        });

        if (!cls) {
            return fail(res, 404, 'NotFound', `Class not found: ${class_id}`);
        }

        return res.status(200).json({
            success: true,
            message: 'Class retrieved successfully',
            data: {
                class_id: cls.classId,
                class_name: cls.name,
                number_of_students: cls.numberOfStudents,
                status: cls.status,
                actual_student_count: cls._count.students,
                subjects: cls.subjects.map((s) => ({
                    subject_id: s.subject.subjectId,
                    name: s.subject.name
                }))
            }
        });
    } catch (error) {
        console.error('Error in getClassById:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** POST /api/class */
export const createClass = async (req, res) => {
    try {
        const { class_id, name } = req.body || {};

        if (!class_id || !name) {
            return fail(res, 400, 'ValidationError', 'Missing class_id or name');
        }

        const created = await prisma.class.create({
            data: { classId: class_id, name }
        });

        return res.status(201).json({
            success: true,
            message: 'Class created successfully',
            data: { class_id: created.classId, class_name: created.name, status: created.status }
        });
    } catch (error) {
        if (error.code === 'P2002') {
            return fail(res, 409, 'DuplicateEntry', `Class ID ${req.body?.class_id} already exists`);
        }
        console.error('Error in createClass:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** PUT /api/class/:class_id — chỉ sửa tên/trạng thái, không đổi mã lớp (khoá chính, ESP32-CAM dựa vào để dựng collection Rekognition). */
export const updateClass = async (req, res) => {
    try {
        const { class_id } = req.params;
        const fieldMap = { name: 'name', status: 'status' };

        const data = {};
        for (const [apiField, column] of Object.entries(fieldMap)) {
            if (req.body?.[apiField] !== undefined) {
                data[column] = req.body[apiField];
            }
        }

        if (Object.keys(data).length === 0) {
            return fail(res, 400, 'ValidationError', 'No fields were provided for update');
        }

        const updated = await prisma.class.update({
            where: { classId: class_id },
            data
        });

        return res.status(200).json({
            success: true,
            message: 'Class updated successfully',
            data: { class_id: updated.classId, class_name: updated.name, status: updated.status }
        });
    } catch (error) {
        if (error.code === 'P2025') {
            return fail(res, 404, 'NotFound', `Class not found: ${req.params.class_id}`);
        }
        console.error('Error in updateClass:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/**
 * DELETE /api/class/:class_id
 * Cascade xoá liên kết class_student và subject_class (schema.prisma: Class
 * onDelete: Cascade) — KHÔNG xoá sinh viên hay môn học, chỉ gỡ liên kết. Bộ
 * sưu tập Rekognition "attendance-system-<class_id>" và ảnh khuôn mặt trên S3
 * KHÔNG bị xoá theo (nằm ngoài Postgres) — phải xoá thủ công qua trang Quản lý
 * khuôn mặt nếu muốn dọn sạch hoàn toàn.
 */
export const deleteClass = async (req, res) => {
    try {
        const { class_id } = req.params;

        await prisma.class.delete({ where: { classId: class_id } });

        return res.status(200).json({
            success: true,
            message: `Deleted class ${class_id}`
        });
    } catch (error) {
        if (error.code === 'P2025') {
            return fail(res, 404, 'NotFound', `Class not found: ${req.params.class_id}`);
        }
        console.error('Error in deleteClass:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};
