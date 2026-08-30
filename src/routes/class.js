import express from 'express';
import { getAllClasses, getClassById, createClass, updateClass, deleteClass } from '../app/controllers/ClassController.js';

const router = express.Router();

router.get('/', getAllClasses);
router.get('/:class_id', getClassById);
router.post('/', createClass);
router.put('/:class_id', updateClass);
router.delete('/:class_id', deleteClass);

export default router;
