import express from 'express';
import { getDeviceSchedule, recordDeviceAttendance } from '../app/controllers/DeviceController.js';
import { requireServiceToken } from '../app/middlewares/authMiddleware.js';

// Route riêng cho Lambda gọi vào — xác thực bằng SERVICE_TOKEN dùng chung
// giữa Lambda và backend, không phải JWT giáo viên (thiết bị IoT không đăng
// nhập). Tách khỏi /api/schedule, /api/attendance để không phải nới lỏng
// requireAuth trên các route giáo viên dùng hàng ngày.
const router = express.Router();

router.use(requireServiceToken);

router.get('/schedule', getDeviceSchedule);
router.post('/attendance', recordDeviceAttendance);

export default router;
