import express from 'express';
import {
    getAllStudents,
    getAllStudentsByClassId,
    getAllStudentsBySubjectId,
    createStudent,
    updateStudent,
    deleteStudent
} from '../app/controllers/StudentController.js';

const router = express.Router();

router.get('/', getAllStudents);
router.get('/class/:class_id', getAllStudentsByClassId);
router.get('/subject/:subject_id', getAllStudentsBySubjectId);
router.post('/', createStudent);
router.put('/:student_id', updateStudent);
router.delete('/:student_id', deleteStudent);

export default router;
