import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, executeTransaction } from '../database/connection.js';
import { auditLog } from '../middleware/index.js';

// Material Out - Distribusi ke lapangan
export async function createMaterialOut(req, res, next) {
  try {
    const { projectId } = req.params;
    const { materialId, quantity, workPackage, purpose, notes } = req.body;
    const userId = req.user.id;

    // Validasi input
    if (!workPackage) {
      return res.status(400).json({ 
        error: 'Work package / distribution target is required',
        field: 'workPackage'
      });
    }

    // Get project stock with FOR UPDATE lock
    const projectStock = await queryOne(
      `SELECT * FROM project_stocks 
       WHERE project_id = $1 AND material_id = $2`,
      [projectId, materialId]
    );

    if (!projectStock) {
      return res.status(404).json({ error: 'Material not found in project stock' });
    }

    if (projectStock.current_qty < quantity) {
      return res.status(400).json({
        error: 'Insufficient stock for material out',
        requested: quantity,
        available: projectStock.current_qty
      });
    }

    // ACID Transaction for Material Out
    await executeTransaction(async (client) => {
      // Reduce stock
      await client.query(
        `UPDATE project_stocks 
         SET current_qty = current_qty - $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [quantity, projectStock.id]
      );

      // Record transaction
      await client.query(
        `INSERT INTO stock_transactions 
         (id, project_stock_id, type, qty_change, reference_work_package, purpose, notes, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          uuidv4(),
          projectStock.id,
          'OUT',
          -quantity,
          workPackage,
          purpose,
          notes,
          userId
        ]
      );
    });

    await auditLog('MATERIAL_OUT', 'INVENTORY', projectStock.id, null, {
      quantity,
      workPackage,
      purpose
    }, req);

    res.status(201).json({
      success: true,
      message: 'Material out recorded successfully',
      data: {
        materialId,
        quantity,
        workPackage,
        purpose,
        newStock: projectStock.current_qty - quantity
      }
    });
  } catch (error) {
    next(error);
  }
}

// Get project inventory status
export async function getProjectInventory(req, res, next) {
  try {
    const { projectId } = req.params;

    const inventory = await queryAll(
      `SELECT 
        ps.id,
        ps.material_id,
        m.material_name,
        m.unit_of_measure,
        m.unit_price,
        ps.current_qty,
        ps.min_stock,
        mb.initial_qty,
        mb.remaining_qty,
        ROUND((mb.remaining_qty::float / mb.initial_qty * 100), 2) as budget_remaining_percentage,
        CASE WHEN ps.current_qty <= ps.min_stock THEN 'CRITICAL' 
             WHEN ps.current_qty <= (ps.min_stock * 1.5) THEN 'LOW' 
             ELSE 'NORMAL' END as stock_status
       FROM project_stocks ps
       JOIN materials m ON ps.material_id = m.id
       JOIN material_budgets mb ON mb.project_id = ps.project_id AND mb.material_id = ps.material_id
       WHERE ps.project_id = $1
       ORDER BY ps.updated_at DESC`,
      [projectId]
    );

    res.json({
      success: true,
      count: inventory.length,
      data: inventory
    });
  } catch (error) {
    next(error);
  }
}

// Get stock transactions (audit trail)
export async function getStockTransactions(req, res, next) {
  try {
    const { projectId } = req.params;
    const { type, startDate, endDate } = req.query;

    let sql = `
      SELECT 
        st.*,
        m.material_name,
        u.full_name as performed_by_name,
        ps.current_qty as current_stock_level
       FROM stock_transactions st
       JOIN project_stocks ps ON st.project_stock_id = ps.id
       JOIN materials m ON ps.material_id = m.id
       JOIN users u ON st.performed_by = u.id
       WHERE ps.project_id = $1
    `;
    
    const params = [projectId];

    if (type) {
      sql += ` AND st.type = $${params.length + 1}`;
      params.push(type);
    }

    if (startDate) {
      sql += ` AND st.created_at >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND st.created_at <= $${params.length + 1}`;
      params.push(endDate);
    }

    sql += ` ORDER BY st.created_at DESC`;

    const transactions = await queryAll(sql, params);

    res.json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    next(error);
  }
}

// Get material distribution report
export async function getMaterialDistribution(req, res, next) {
  try {
    const { projectId } = req.params;
    const { workPackage, startDate, endDate } = req.query;

    let sql = `
      SELECT 
        st.reference_work_package as work_package,
        m.material_name,
        m.unit_of_measure,
        SUM(-st.qty_change) as total_qty_distributed,
        COUNT(DISTINCT st.id) as transaction_count,
        string_agg(DISTINCT st.purpose, '; ') as purposes,
        MAX(st.created_at) as last_distribution
       FROM stock_transactions st
       JOIN project_stocks ps ON st.project_stock_id = ps.id
       JOIN materials m ON ps.material_id = m.id
       WHERE ps.project_id = $1 AND st.type = 'OUT'
    `;

    const params = [projectId];

    if (workPackage) {
      sql += ` AND st.reference_work_package ILIKE $${params.length + 1}`;
      params.push(`%${workPackage}%`);
    }

    if (startDate) {
      sql += ` AND st.created_at >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND st.created_at <= $${params.length + 1}`;
      params.push(endDate);
    }

    sql += ` GROUP BY st.reference_work_package, m.material_name, m.unit_of_measure
             ORDER BY total_qty_distributed DESC`;

    const distribution = await queryAll(sql, params);

    res.json({
      success: true,
      count: distribution.length,
      data: distribution
    });
  } catch (error) {
    next(error);
  }
}

// Get budget vs actual tracking
export async function getBudgetVsActual(req, res, next) {
  try {
    const { projectId } = req.params;

    const tracking = await queryAll(
      `SELECT 
        m.id,
        m.material_name,
        m.unit_of_measure,
        m.unit_price,
        mb.initial_qty as planned_qty,
        mb.budget_plafon as planned_budget,
        ps.current_qty as on_site_qty,
        (mb.initial_qty - ps.current_qty) as total_used_qty,
        COALESCE(ps.current_qty, 0) * m.unit_price as actual_spent,
        (mb.budget_plafon - COALESCE(ps.current_qty, 0) * m.unit_price) as remaining_budget,
        ROUND(((mb.initial_qty - COALESCE(ps.current_qty, 0))::float / mb.initial_qty * 100), 2) as utilization_percentage
       FROM material_budgets mb
       JOIN materials m ON mb.material_id = m.id
       LEFT JOIN project_stocks ps ON ps.project_id = mb.project_id AND ps.material_id = mb.material_id
       WHERE mb.project_id = $1
       ORDER BY m.material_name`,
      [projectId]
    );

    res.json({
      success: true,
      count: tracking.length,
      data: tracking
    });
  } catch (error) {
    next(error);
  }
}

// Adjust budget quota (if needed)
export async function adjustBudgetQuota(req, res, next) {
  try {
    const { projectId } = req.params;
    const { materialId, adjustmentQty, reason } = req.body;
    const userId = req.user.id;

    const budget = await queryOne(
      'SELECT * FROM material_budgets WHERE project_id = $1 AND material_id = $2',
      [projectId, materialId]
    );

    if (!budget) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    const oldBudget = { ...budget };
    
    const updated = await executeTransaction(async (client) => {
      const newRemaining = budget.remaining_qty + adjustmentQty;
      
      if (newRemaining < 0) {
        throw new Error('Adjustment would result in negative quota');
      }

      return await client.query(
        `UPDATE material_budgets 
         SET remaining_qty = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [newRemaining, budget.id]
      );
    });

    await auditLog('ADJUST_QUOTA', 'MATERIAL_BUDGET', budget.id, oldBudget, updated.rows[0], req);

    res.json({
      success: true,
      message: 'Budget quota adjusted',
      adjustment: {
        quantity: adjustmentQty,
        reason,
        oldRemaining: budget.remaining_qty,
        newRemaining: budget.remaining_qty + adjustmentQty
      },
      budget: updated.rows[0]
    });
  } catch (error) {
    next(error);
  }
}
