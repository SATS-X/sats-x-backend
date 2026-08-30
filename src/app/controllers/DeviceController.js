import prisma from '../../config/db/index.js';

const fail = (res, status, error, message) =>
    res.status(status).json({ success: false, error, message });

const VN_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

/**
 * Trả về ngày/giờ theo múi giờ VN cho một thời điểm UTC bất kỳ — dùng
 * Intl.DateTimeFormat thay vì tự cộng/trừ 7 tiếng vào epoch, vì phép cộng thủ
 * công chỉ đúng khi input chưa có sẵn offset (dễ cộng nhầm lần hai nếu Date đã
 * được parse từ chuỗi ISO có "+07:00" sẵn trong đó).
 */
const toVietnamParts = (date) => {
    const parts = Object.fromEntries(VN_FORMATTER.formatToParts(date).map((p) => [p.type, p.value]));
    return {
        day: Number(parts.day),
        month: Number(parts.month),
        year: Number(parts.year),
        time: `${parts.hour}:${parts.minute}`
    };
};

const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

/**
 * GET /api/device/schedule?day=&month=&year=
 * Firmware ESP32-CAM gọi route "schedule" qua Lambda, luôn gửi kèm đúng bộ ba
 * ngày/tháng/năm hiện tại — không gửi teacher_id hay device_id nào cả, nên trả
 * về TOÀN BỘ lịch học trong ngày đó; thiết bị tự chọn tiết đang diễn ra bằng
 * giờ (xem findCurrentSchedule() trong websocket.cpp).
 *
 * Hình dạng response phải khớp CHÍNH XÁC với những gì firmware parse — không
 * bọc trong "data" như các route khác, vì đây là field top-level firmware đọc
 * trực tiếp: doc["schedule"], doc["metadata"].
 */
export const getDeviceSchedule = async (req, res) => {
    try {
        const today = toVietnamParts(new Date());
        const day = Number.parseInt(req.query.day, 10) || today.day;
        const month = Number.parseInt(req.query.month, 10) || today.month;
        const year = Number.parseInt(req.query.year, 10) || today.year;

        const schedules = await prisma.schedule.findMany({
            where: { day, month, year },
            include: {
                subject: {
                    include: {
                        classes: { include: { class: true } }
                    }
                },
                teacher: { select: { fullName: true } }
            },
            orderBy: { startTime: 'asc' }
        });

        // Một tiết học có thể dạy cho nhiều lớp (subject_class nhiều-nhiều) —
        // firmware chọn theo giờ, không theo lớp, nên tách thành một dòng cho
        // mỗi cặp (tiết học, lớp) để thiết bị nhìn thấy đủ mọi lựa chọn.
        const scheduleItems = schedules.flatMap((s) => {
            const classes = s.subject?.classes?.map((sc) => sc.class) ?? [];
            const base = {
                subject_code: s.subjectId,
                subject_name: s.subject?.name ?? '',
                teacher_name: s.teacher?.fullName ?? '',
                room: s.room,
                start_time: s.startTime,
                end_time: s.endTime,
                time_slot: `${s.startTime} - ${s.endTime}`,
                day_name: s.dayOfWeek
            };

            if (classes.length === 0) {
                // Tiết học chưa gán lớp nào — vẫn trả về để không mất dữ liệu,
                // nhưng thiết bị sẽ báo lỗi "No class_id" nếu chọn trúng dòng này.
                return [{ ...base, class_id: '', class_name: '' }];
            }

            return classes.map((c) => ({ ...base, class_id: c.classId, class_name: c.name }));
        });

        return res.status(200).json({
            status: 'success',
            message: `Retrieved schedule for ${day}/${month}/${year} successfully`,
            schedule: scheduleItems,
            metadata: {
                total_classes: scheduleItems.length,
                day,
                month,
                year,
                timezone: 'Asia/Ho_Chi_Minh (GMT+7)'
            }
        });
    } catch (error) {
        console.error('Error in getDeviceSchedule:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};

/**
 * POST /api/device/attendance
 * Lambda "attendance" gọi vào đây ngay sau khi AWS Rekognition khớp khuôn mặt
 * successfully (search_faces_by_image), để ghi bản ghi điểm danh thật vào DB.
 * Body: { studentId, classId, imageKey, timestamp }
 *
 * studentId đến từ ExternalImageId của Rekognition — chính là student_id thật
 * (xem lambda/face_management: ExternalImageId=student_id lúc IndexFaces),
 * không cần tách chuỗi gì thêm.
 */
export const recordDeviceAttendance = async (req, res) => {
    try {
        const { studentId, classId, imageKey, timestamp } = req.body || {};

        if (!studentId || !classId) {
            return fail(res, 400, 'ValidationError', 'Missing studentId or classId');
        }

        const capturedAt = timestamp ? new Date(timestamp) : new Date();
        if (Number.isNaN(capturedAt.getTime())) {
            return fail(res, 400, 'ValidationError', 'Invalid timestamp');
        }

        // Lambda gửi ISO string có sẵn offset "+07:00" — Date parse ra đúng thời
        // điểm UTC tuyệt đối, nên phải quy đổi sang giờ VN qua Intl, không được
        // đọc thẳng bằng getUTC* (sẽ lùi mất 7 tiếng).
        const { day, month, year, time } = toVietnamParts(capturedAt);
        const nowMinutes = toMinutes(time);

        // Tìm tiết học đang diễn ra cho đúng lớp này tại thời điểm chụp ảnh —
        // ESP32-CAM không gửi kèm subject_id lúc compare (chỉ gửi class_id),
        // nên phải tự suy luận lại giống hệt logic findCurrentSchedule() phía
        // firmware, nhưng bằng dữ liệu chuẩn từ DB thay vì tin thiết bị.
        const candidates = await prisma.schedule.findMany({
            where: {
                day,
                month,
                year,
                subject: { classes: { some: { classId } } }
            },
            include: { subject: true }
        });

        const activeSchedule = candidates.find((s) => {
            const start = toMinutes(s.startTime);
            const end = toMinutes(s.endTime);
            return nowMinutes >= start && nowMinutes <= end;
        });

        if (!activeSchedule) {
            return res.status(409).json({
                success: false,
                error: 'NoActiveSchedule',
                reason: 'ATTENDANCE_PERIOD_EXPIRED',
                message: `No active session for class ${classId} at ${time}`
            });
        }

        const subjectId = activeSchedule.subjectId;
        const minutesLate = nowMinutes - toMinutes(activeSchedule.startTime);
        const remark = minutesLate <= 15 ? 'On Time' : 'Late';

        // Lambda cần thông tin lớp/môn để dựng đúng hình dạng "class_info" mà
        // firmware parse ra hiển thị lên LCD (subject/room/start_time/end_time).
        const classInfo = {
            subject: activeSchedule.subject?.name ?? subjectId,
            room: activeSchedule.room,
            start_time: activeSchedule.startTime,
            end_time: activeSchedule.endTime
        };

        // Một sinh viên chỉ điểm danh một lần cho một môn trong một ngày — nhận
        // diện lại (đi qua camera lần nữa) trả về bản ghi đã có, không tạo trùng.
        const existing = await prisma.attendance.findFirst({
            where: { studentId, subjectId, day, month, year }
        });

        if (existing) {
            return res.status(200).json({
                success: true,
                message: 'Student has already attended this subject today',
                duplicate: true,
                data: { student_id: existing.studentId, subject_id: existing.subjectId, remark: existing.remark, class_info: classInfo }
            });
        }

        const created = await prisma.attendance.create({
            data: {
                studentId,
                subjectId,
                time,
                day,
                month,
                year,
                dayOfWeek: activeSchedule.dayOfWeek,
                status: 1,
                remark,
                imageKey: imageKey || null
            }
        });

        return res.status(201).json({
            success: true,
            message: `Attendance recorded: ${remark}`,
            data: {
                student_id: created.studentId,
                subject_id: created.subjectId,
                remark: created.remark,
                time: created.time,
                class_info: classInfo
            }
        });
    } catch (error) {
        // FK lỗi (studentId không tồn tại trong bảng student) — trả 404 thay vì 500,
        // vì đây là lỗi dữ liệu đầu vào, không phải lỗi hệ thống.
        if (error.code === 'P2003') {
            return fail(res, 404, 'StudentNotFound', `Student not found: ${req.body?.studentId}`);
        }
        console.error('Error in recordDeviceAttendance:', error);
        return fail(res, 500, 'Internal server error', error.message);
    }
};
