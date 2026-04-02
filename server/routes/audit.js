import express from 'express';
import ExcelJS from 'exceljs';
import db from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/history/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  try {
    const logs = db.prepare(`
      SELECT
        audit_logs.*,
        users.email as user_email,
        users.name as user_name
      FROM audit_logs
      LEFT JOIN users ON audit_logs.user_id = users.id
      WHERE table_name = 'inventory' AND record_id = ?
      ORDER BY timestamp DESC
    `).all(id);

    const formattedLogs = logs.map(log => ({
      id: log.id,
      action: log.action,
      timestamp: log.timestamp,
      user: {
        email: log.user_email,
        name: log.user_name
      },
      old_values: log.old_values ? JSON.parse(log.old_values) : null,
      new_values: log.new_values ? JSON.parse(log.new_values) : null
    }));

    res.json(formattedLogs);
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/export', authenticateToken, requireRole('admin', 'audit_manager'), async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    let query = `
      SELECT
        audit_logs.*,
        users.email as user_email,
        users.name as user_name
      FROM audit_logs
      LEFT JOIN users ON audit_logs.user_id = users.id
      WHERE 1=1
    `;

    const params = [];

    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY timestamp DESC';

    const logs = db.prepare(query).all(...params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Audit Logs');

    worksheet.columns = [
      { header: 'Timestamp', key: 'timestamp', width: 20 },
      { header: 'User Email', key: 'user_email', width: 25 },
      { header: 'User Name', key: 'user_name', width: 20 },
      { header: 'Action', key: 'action', width: 15 },
      { header: 'Table', key: 'table_name', width: 15 },
      { header: 'Record ID', key: 'record_id', width: 12 },
      { header: 'Old Values', key: 'old_values', width: 40 },
      { header: 'New Values', key: 'new_values', width: 40 },
      { header: 'IP Address', key: 'ip_address', width: 15 },
    ];

    logs.forEach(log => {
      worksheet.addRow({
        timestamp: log.timestamp,
        user_email: log.user_email,
        user_name: log.user_name,
        action: log.action,
        table_name: log.table_name,
        record_id: log.record_id,
        old_values: log.old_values,
        new_values: log.new_values,
        ip_address: log.ip_address,
      });
    });

    worksheet.getRow(1).font = { bold: true };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=audit_logs_${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
