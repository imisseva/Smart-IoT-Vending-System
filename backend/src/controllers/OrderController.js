import * as OrderService from '../services/OrderService.js';

export const createOrder = async (req, res) => {
    try {
        const { username, drink_name, size } = req.body;
        const newOrder = await OrderService.createOrder({ username, drink_name, size });
        res.status(201).json({ success: true, data: newOrder });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getQueue = async (req, res) => {
    try {
        const queue = await OrderService.getQueue();
        res.status(200).json({ success: true, data: queue });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const payOrder = async (req, res) => {
    try {
        const { id } = req.params;
        await OrderService.payOrder(id);
        res.status(200).json({ success: true, message: 'Thanh toán thành công' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await OrderService.getOrderById(id);
        if (!order) {
            return res.status(404).json({ success: true, data: null });
        }
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

