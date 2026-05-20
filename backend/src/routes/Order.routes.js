import express from 'express';
import { createOrder, getQueue, payOrder } from '../controllers/OrderController.js';

const router = express.Router();

router.post('/', createOrder);
router.get('/queue', getQueue);
router.post('/:id/pay', payOrder);

export default router;
