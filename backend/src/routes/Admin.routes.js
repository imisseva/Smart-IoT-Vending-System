import express from 'express';
import { loginAdmin } from '../controllers/AdminController.js';

const router = express.Router();

router.post('/login', loginAdmin);

export default router;
