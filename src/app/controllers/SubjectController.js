import prisma from '../../config/db/index.js';

const fail = (res, status, error, message) =>
    res.status(status).json({ success: false, error, message });

const TEACHER_SELECT = {
    teacherId: true,
    fullName: true,
    email: true,
    phoneNumber: true
};

const toTeacher = (t) =>
    t
        ? {
              teacher_id: t.teacherId,
              teacher_name: t.fullName,
              teacher_email: t.email,
              teacher_phone: t.phoneNumber
          }
        : null;

/** GET /api/subject/teacher/:teacher_id */
export const getAllSubjectsByTeacherId = async (req, res) => {
    try {
        const { teacher_id } = req.params;

        if (!teacher_id) {
            return fail(res, 400, 'ValidationError', 'Missing teacher_id parameter');
        }

        const subjects = await prisma.subject.findMany({
            where: { teacherId: teacher_id },
            include: {
                teacher: { select: TEACHER_SELECT },
                _count: { select: { students: true, classes: true } }
            },
            orderBy: { subjectId: 'asc' }
        });

        const data = subjects.map((s) => ({
            subject_id: s.subjectId,
            name: s.name,
            teacher_id: s.teacherId,
            ...toTeacher(s.teacher),
            student_count: s._count.students,
            class_count: s._count.classes
        }));

        return res.status(200).json({
            success: true,
            message: `Subjects for teacher ${teacher_id} retrieved successfully`,
            data,
            count: data.length,
            teacher_id
        });
    } catch (error) {
        console.error('Error in getAllSubjectsByTeacherId:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** GET /api/subject/:subject_id */
export const getSubjectById = async (req, res) => {
    try {
        const { subject_id } = req.params;

        if (!subject_id) {
            return fail(res, 400, 'ValidationError', 'Missing subject_id parameter');
        }

        const subject = await prisma.subject.findUnique({
            where: { subjectId: subject_id },
            include: {
                teacher: { select: TEACHER_SELECT },
                classes: {
                    select: {
                        class: {
                            select: { classId: true, name: true, numberOfStudents: true, status: true }
                        }
                    }
                }
            }
        });

        if (!subject) {
            return fail(res, 404, 'NotFound', `Subject not found: ${subject_id}`);
        }

        return res.status(200).json({
            success: true,
            message: 'Subject retrieved successfully',
            data: {
                subject_id: subject.subjectId,
                name: subject.name,
                teacher_id: subject.teacherId,
                ...toTeacher(subject.teacher)
            },
            classes: subject.classes.map((c) => ({
                class_id: c.class.classId,
                class_name: c.class.name,
                number_of_students: c.class.numberOfStudents,
                status: c.class.status
            })),
            count: subject.classes.length
        });
    } catch (error) {
        console.error('Error in getSubjectById:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** GET /api/subject/:subject_id/students */
export const getSubjectStudent = async (req, res) => {
    try {
        const { subject_id } = req.params;

        if (!subject_id) {
            return fail(res, 400, 'ValidationError', 'Missing subject_id parameter');
        }

        const subject = await prisma.subject.findUnique({
            where: { subjectId: subject_id },
            include: {
                teacher: { select: TEACHER_SELECT },
                students: {
                    select: {
                        student: {
                            select: { studentId: true, fullName: true, email: true, phoneNumber: true }
                        }
                    }
                }
            }
        });

        if (!subject) {
            return res.status(404).json({
                success: false,
                error: 'No students found for this subject or subject does not exist',
                subject_id
            });
        }

        const students = subject.students
            .map((s) => ({
                student_id: s.student.studentId,
                full_name: s.student.fullName,
                email: s.student.email,
                phone_number: s.student.phoneNumber
            }))
            .sort((a, b) => a.full_name.localeCompare(b.full_name));

        return res.status(200).json({
            success: true,
            message: 'Students of subject retrieved successfully',
            subject: {
                subject_id: subject.subjectId,
                subject_name: subject.name,
                teacher: toTeacher(subject.teacher)
            },
            count: students.length,
            students
        });
    } catch (error) {
        console.error('Error in getSubjectStudent:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};
