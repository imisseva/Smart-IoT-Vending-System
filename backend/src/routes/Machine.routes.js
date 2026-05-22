import express from 'express';
import { 
    dispenseDrink, 
    completeOrder, 
    getCommand, 
    updateSensor, 
    dropCup,
    refillWater,
    getMachineStatus,
    getAnalytics
} from '../controllers/MachineController.js';

const router = express.Router();

// API cho Web App gọi
router.post('/dispense', dispenseDrink);
router.post('/complete', completeOrder);
router.post('/drop-cup', dropCup);
router.post('/refill', refillWater);
router.get('/status', getMachineStatus);
router.get('/analytics', getAnalytics);

// API cho ESP8266 gọi
router.get('/command', getCommand);
router.post('/status', updateSensor);

export default router;

