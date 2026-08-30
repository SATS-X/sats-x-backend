import prisma from '../../config/db/index.js';

const fail = (res, status, error, message) =>
    res.status(status).json({ success: false, error, message });

const NEWEST_FIRST = [{ year: 'desc' }, { month: 'desc' }, { day: 'desc' }, { startTime: 'asc' }];

const toScheduleRow = (s) => ({
    id: s.id,
    day: s.day,
    month: s.month,
    year: s.year,
    day_of_week: s.dayOfWeek,
    subject_id: s.subjectId,
    subject_name: s.subject?.name ?? null,
    teacher_id: s.teacherId,
    teacher_name: s.teacher?.fullName ?? null,
    teacher_email: s.teacher?.email ?? null,
    teacher_phone: s.teacher?.phoneNumber ?? null,
    room: s.room,
    start_time: s.startTime,
    end_time: s.endTime,
    status: s.status
});

const WITH_RELATIONS = {
    subject: { select: { name: true } },
    teacher: { select: { fullName: true, email: true, phoneNumber: true } }
};

/**
 * GET /api/schedule
 * Lọc tuỳ chọn theo ngày: ?day=&month=&year=
 * Thiết bị ESP32-CAM gọi qua Lambda với đúng bộ ba này.
 */
export const getAllSchedules = async (req, res) => {
    try {
        const where = {};
        for (const field of ['day', 'month', 'year']) {
            const value = Number.parseInt(req.query?.[field], 10);
            if (Number.isInteger(value)) {
                where[field] = value;
            }
        }

        const schedules = await prisma.schedule.findMany({
            where,
            include: WITH_RELATIONS,
            orderBy: NEWEST_FIRST
        });

        const data = schedules.map(toScheduleRow);

        return res.status(200).json({
            success: true,
            message: 'Schedules retrieved successfully',
            data,
            count: data.length
        });
    } catch (error) {
        console.error('Error in getAllSchedules:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/** GET /api/schedule/teacher/:teacher_id */
export const getScheduleByTeacherId = async (req, res) => {
    try {
        const { teacher_id } = req.params;

        if (!teacher_id) {
            return fail(res, 400, 'ValidationError', 'Missing teacher_id parameter');
        }

        const schedules = await prisma.schedule.findMany({
            where: { teacherId: teacher_id },
            include: WITH_RELATIONS,
            orderBy: NEWEST_FIRST
        });

        const data = schedules.map(toScheduleRow);

        return res.status(200).json({
            success: true,
            message: 'Schedule retrieved successfully',
            teacher_id,
            count: data.length,
            data
        });
    } catch (error) {
        console.error('Error in getScheduleByTeacherId:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};
