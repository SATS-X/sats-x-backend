import studentRouter from './student.js';
import subjectRouter from './subject.js';
import attendanceRouter from './attendance.js';
import scheduleRouter from './schedule.js';
import classRouter from './class.js';
import authRouter from './auth.js';
import deviceRouter from './device.js';
import { requireAuth } from '../app/middlewares/authMiddleware.js';

export default function routes(app) {
    // Không yêu cầu token — đây là nơi lấy token.
    app.use('/api/auth', authRouter);

    // Toàn bộ dữ liệu nghiệp vụ nằm sau requireAuth.
    app.use('/api/student', requireAuth, studentRouter);
    app.use('/api/subject', requireAuth, subjectRouter);
    app.use('/api/attendance', requireAuth, attendanceRouter);
    app.use('/api/schedule', requireAuth, scheduleRouter);
    app.use('/api/class', requireAuth, classRouter);

    // Lambda (ESP32-CAM/ESP32) gọi vào đây — tự xác thực bằng SERVICE_TOKEN
    // riêng trong deviceRouter, không dùng requireAuth (JWT giáo viên).
    app.use('/api/device', deviceRouter);
}
