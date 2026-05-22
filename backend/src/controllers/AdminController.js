import pool from '../config/db.js';

export const loginAdmin = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Vui lòng điền đầy đủ thông tin' });
        }

        const result = await pool.query(
            'SELECT id, username FROM admin WHERE username = $1 AND password = $2',
            [username.trim(), password.trim()]
        );

        if (result.rows.length > 0) {
            res.status(200).json({ 
                success: true, 
                message: 'Đăng nhập thành công', 
                admin: result.rows[0] 
            });
        } else {
            res.status(401).json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
        }
    } catch (error) {
        console.error('[AdminController - loginAdmin Error] Lỗi:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
