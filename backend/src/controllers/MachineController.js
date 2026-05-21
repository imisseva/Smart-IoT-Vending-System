import * as MachineService from '../services/MachineService.js';

export const dispenseDrink = async (req, res) => {
    try {
        const { order_id } = req.body;
        const result = await MachineService.dispenseDrink(order_id);
        res.status(200).json({ success: true, message: 'Hệ thống bắt đầu rót nước', command: result.command });
    } catch (error) {
        const status = error.message === 'Không tìm thấy order' ? 404 : 500;
        res.status(status).json({ success: false, error: error.message });
    }
};

export const completeOrder = async (req, res) => {
    try {
        const { order_id } = req.body;
        await MachineService.completeOrder(order_id);
        res.status(200).json({ success: true, message: 'Hoàn tất order' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getCommand = (req, res) => {
    res.send(MachineService.getCommand());
};

export const updateSensor = async (req, res) => {
    try {
        const { water_level, is_cup_placed, dispensing_progress, pour_status } = req.body;
        await MachineService.updateSensor(water_level, is_cup_placed, dispensing_progress, pour_status);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const dropCup = async (req, res) => {
    try {
        const { order_id } = req.body;
        const result = await MachineService.dropCup(order_id);
        res.status(200).json({ success: true, message: 'Đang nhả ly', command: result.command });
    } catch (error) {
        const status = error.message === 'Không tìm thấy order' ? 404 : 500;
        res.status(status).json({ success: false, error: error.message });
    }
};

