import pool from '../config/db.js';

// Cập nhật máy sang trạng thái Dispensing
export const setDispensing = async (queueNumber) => {
    await pool.query(
        `INSERT INTO Machine_Status (id, water_level, machine_state, current_queue, updated_at) 
         VALUES (1, 0, 'Dispensing', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE 
         SET machine_state = 'Dispensing', current_queue = $1, updated_at = CURRENT_TIMESTAMP`,
        [queueNumber]
    );
};

// Reset máy về trạng thái Ready
export const setReady = async () => {
    await pool.query(
        `UPDATE Machine_Status SET machine_state = 'Ready', current_queue = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1`
    );
};

// Cập nhật mực nước từ cảm biến
export const updateWaterLevel = async (waterLevel) => {
    await pool.query(
        `INSERT INTO Machine_Status (id, water_level, machine_state, updated_at) 
         VALUES (1, $1, 'Ready', CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE 
         SET water_level = EXCLUDED.water_level, updated_at = CURRENT_TIMESTAMP`,
        [waterLevel]
    );
};
