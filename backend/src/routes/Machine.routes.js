import express from 'express';
import { dispenseDrink, completeOrder, getCommand, updateSensor, dropCup } from '../controllers/MachineController.js';

const router = express.Router();

// API cho Web App gọi
router.post('/dispense', dispenseDrink);
router.post('/complete', completeOrder);
router.post('/drop-cup', dropCup);


// API cho ESP8266 gọi
router.get('/command', getCommand);
router.post('/status', updateSensor);

export default router;
