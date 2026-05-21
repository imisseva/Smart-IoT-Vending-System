import express from 'express';
import { createOrder, getQueue, payOrder, getOrderById } from '../controllers/OrderController.js';

const router = express.Router();

router.post('/', createOrder);
router.get('/queue', getQueue);
router.get('/:id', getOrderById);
router.post('/:id/pay', payOrder);

export default router;

