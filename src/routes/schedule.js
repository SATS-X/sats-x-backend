import express from 'express';
import { getAllSchedules, getScheduleByTeacherId } from '../app/controllers/ScheduleController.js';
import { requireSelfOrAdmin } from '../app/middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', getAllSchedules);
router.get('/teacher/:teacher_id', requireSelfOrAdmin('teacher_id'), getScheduleByTeacherId);

export default router;
