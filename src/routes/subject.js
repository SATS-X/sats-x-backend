import express from 'express';
import {
    getAllSubjectsByTeacherId,
    getSubjectById,
    getSubjectStudent
} from '../app/controllers/SubjectController.js';
import { requireSelfOrAdmin } from '../app/middlewares/authMiddleware.js';

const router = express.Router();

// Route tĩnh phải đứng trước '/:subject_id', nếu không 'teacher' sẽ bị
// hiểu thành một subject_id.
router.get('/teacher/:teacher_id', requireSelfOrAdmin('teacher_id'), getAllSubjectsByTeacherId);
router.get('/:subject_id/students', getSubjectStudent);
router.get('/:subject_id', getSubjectById);

export default router;
