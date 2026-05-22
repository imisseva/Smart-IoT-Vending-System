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

// Cập nhật mực nước từ cảm biến của từng bình nước theo ID (id=1: Coca, id=2: Pepsi)
export const updateWaterLevel = async (id, waterLevel) => {
    const parsed = parseFloat(waterLevel);
    const roundedLevel = isNaN(parsed) ? 0 : Math.round(parsed);

    await pool.query(
        `INSERT INTO Machine_Status (id, water_level, machine_state, updated_at) 
         VALUES ($1, $2, 'Ready', CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE 
         SET water_level = EXCLUDED.water_level, updated_at = CURRENT_TIMESTAMP`,
        [id, roundedLevel]
    );
};

// Lấy thông tin trạng thái của bình nước chính id = 1 (máy rơ-le)
export const getMachineStatus = async () => {
    const result = await pool.query('SELECT * FROM Machine_Status WHERE id = 1');
    return result.rows[0] || null;
};

// Lấy thông tin trạng thái của tất cả bình nước giải khát (id = 1: Coca, id = 2: Pepsi)
export const getAllMachineStatus = async () => {
    // Đảm bảo cả hai bình chứa Coca (id=1) và Pepsi (id=2) đều tồn tại trong Database
    await pool.query(`
        INSERT INTO Machine_Status (id, water_level, machine_state, updated_at) 
        VALUES (1, 5000, 'Ready', CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO NOTHING
    `);
    await pool.query(`
        INSERT INTO Machine_Status (id, water_level, machine_state, updated_at) 
        VALUES (2, 5000, 'Ready', CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO NOTHING
    `);

    const result = await pool.query('SELECT * FROM Machine_Status ORDER BY id ASC');
    return result.rows;
};

// Trừ đi lượng nước ảo khi hoàn tất rót nước theo ID bình nước
export const subtractWaterLevel = async (id, ml) => {
    await pool.query(
        `UPDATE Machine_Status 
         SET water_level = GREATEST(0, water_level - $1), 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [ml, id]
    );
};
