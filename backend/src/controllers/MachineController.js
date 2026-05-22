import * as MachineService from '../services/MachineService.js';

export const dispenseDrink = async (req, res) => {
    try {
        const { order_id } = req.body;
        const result = await MachineService.dispenseDrink(order_id);
        res.status(200).json({ success: true, message: 'Hệ thống bắt đầu rót nước', command: result.command });
    } catch (error) {
        console.error('[MachineController - dispenseDrink Error] Lỗi:', error);
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
        console.error('[MachineController - completeOrder Error] Lỗi:', error);
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
        console.error('[MachineController - updateSensor Error] Lỗi:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const dropCup = async (req, res) => {
    try {
        const { order_id } = req.body;
        const result = await MachineService.dropCup(order_id);
        res.status(200).json({ success: true, message: 'Đang nhả ly', command: result.command });
    } catch (error) {
        console.error('[MachineController - dropCup Error] Lỗi:', error);
        const status = error.message === 'Không tìm thấy order' ? 404 : 500;
        res.status(status).json({ success: false, error: error.message });
    }
};

export const refillWater = async (req, res) => {
    try {
        const { id, water_level } = req.body;
        const result = await MachineService.refillWater(id, water_level);
        res.status(200).json(result);
    } catch (error) {
        console.error('[MachineController - refillWater Error] Lỗi:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getMachineStatus = async (req, res) => {
    try {
        const statuses = await MachineService.getAllMachineStatus();
        res.status(200).json({ success: true, data: statuses });
    } catch (error) {
        console.error('[MachineController - getMachineStatus Error] Lỗi:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getAnalytics = async (req, res) => {
    try {
        const analytics = await MachineService.getAnalytics();
        res.status(200).json({ success: true, data: analytics });
    } catch (error) {
        console.error('[MachineController - getAnalytics Error] Lỗi:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
