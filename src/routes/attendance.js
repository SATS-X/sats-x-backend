import express from 'express';
import {
    getAllAttendance,
    getAllAttendanceByClassId,
    getAllAttendanceByStudentId,
    getAllStudentsBySubjectId
} from '../app/controllers/AttendanceController.js';

const router = express.Router();

// Trước đây cả ba route đều là '/:x' nên Express chỉ khớp cái đầu tiên
// và hai cái sau không bao giờ chạy. Tiền tố tĩnh làm chúng phân biệt được.
router.get('/', getAllAttendance);
router.get('/class/:class_id', getAllAttendanceByClassId);
router.get('/subject/:subject_id', getAllStudentsBySubjectId);
router.get('/student/:student_id', getAllAttendanceByStudentId);

export default router;
