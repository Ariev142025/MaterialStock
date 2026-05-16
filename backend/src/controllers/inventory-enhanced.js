import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, executeTransaction, query } from '../database/connection.js';
import { auditLog } from '../middleware/index.js';

/**
 * Material Out Tracking - Enhanced with mandatory distribution target
 * Every material out MUST include:
 * - Work package name (paket pekerjaan)
 * - Unit/building designation (unit bangunan)
 * - Cost center (pusat biaya)
 * - Purpose of use (tujuan penggunaan)
 */

// Create Material Out Record (Mandatory Distribution Details)
export async function createMaterialOut(req, res, next) {
  try {
    const { projectId } = req.params;
    const {
      materialId,
      quantity,
      workPackage,      // REQUIRED: e.g., "Basement Foundation - Unit A"
      unit,             // OPTIONAL: specific unit designation
      costCenter,       // OPTIONAL: cost center code
      purpose,          // REQUIRED: e.g., "Concrete pouring"
      notes,            // OPTIONAL: additional notes
      location,         // OPTIONAL: physical location at site
    } = req.body;
    const userId = req.user.id;

    // ========== MANDATORY FIELD VALIDATION ==========
    if (!workPackage || workPackage.trim() === '') {
      return res.status(400).json({
        error: 'Work package is mandatory',
        field: 'workPackage',
        details: 'Setiap pengambilan material wajib menyertakan tujuan penggunaan (paket pekerjaan)'
      });
    }

    if (!purpose || purpose.trim() === '') {
      return res.status(400).json({
        error: 'Purpose of use is mandatory',
        field: 'purpose',
        details: 'Jelaskan tujuan penggunaan material (concrete, formwork, etc)'
      });
    }

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        error: 'Quantity must be greater than 0',
        field: 'quantity'
      });
    }

    // ========== MATERIAL & PROJECT VALIDATION ==========
    const material = await queryOne(
      'SELECT * FROM materials WHERE id = $1 AND is_active = true',
      [materialId]
    );

    if (!material) {
      return res.status(404).json({ error: 'Material not found or inactive' });
    }

    const project = await queryOne(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // ========== STOCK AVAILABILITY CHECK ==========
    const projectStock = await queryOne(
      `SELECT * FROM project_stocks 
       WHERE project_id = $1 AND material_id = $2`,
      [projectId, materialId]
    );

    if (!projectStock) {
      return res.status(404).json({
        error: 'Material not found in project inventory',
        material: material.material_name
      });
    }

    if (projectStock.current_qty < quantity) {
      return res.status(400).json({
        error: 'Insufficient stock for material out',
        material: material.material_name,
        requested: quantity,
        available: projectStock.current_qty,
        unit: material.unit_of_measure
      });
    }

    // ========== STOCK MINIMUM LEVEL WARNING ==========
    const newStock = projectStock.current_qty - quantity;
    const minStockPercentage = projectStock.min_stock * 1.5;

    let stockWarning = null;
    if (newStock <= projectStock.min_stock) {
      stockWarning = {
        level: 'CRITICAL',
        message: 'Stock will reach critical level',
        remainingQty: newStock,
        minStock: projectStock.min_stock
      };
    } else if (newStock <= minStockPercentage) {
      stockWarning = {
        level: 'LOW',
        message: 'Stock level getting low',
        remainingQty: newStock,
        minStock: projectStock.min_stock
      };
    }

    // ========== ACID TRANSACTION - Material Out ==========
    let transactionId;
    try {
      await executeTransaction(async (client) => {
        // 1. Lock row untuk prevent race condition
        const locked = await client.query(
          `SELECT * FROM project_stocks 
           WHERE id = $1
           FOR UPDATE`,
          [projectStock.id]
        );

        if (locked.rows.length === 0) {
          throw new Error('Stock record not found');
        }

        // Double-check setelah lock
        const currentStock = locked.rows[0].current_qty;
        if (currentStock < quantity) {
          throw new Error(`Insufficient stock. Current: ${currentStock}, Requested: ${quantity}`);
        }

        // 2. Update stock quantity
        await client.query(
          `UPDATE project_stocks 
           SET current_qty = current_qty - $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [quantity, projectStock.id]
        );

        // 3. Record transaction dengan detail distribusi lengkap
        const txResult = await client.query(
          `INSERT INTO stock_transactions 
           (id, project_stock_id, type, qty_change, reference_work_package, 
            reference_unit, reference_cost_center, purpose, location, notes, performed_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
           RETURNING *`,
          [
            uuidv4(),
            projectStock.id,
            'OUT',
            -quantity,
            workPackage,
            unit || null,
            costCenter || null,
            purpose,
            location || null,
            notes || null,
            userId
          ]
        );

        transactionId = txResult.rows[0].id;
      });
    } catch (txError) {
      console.error('Transaction error:', txError);
      return res.status(400).json({
        error: 'Failed to record material out',
        details: txError.message
      });
    }

    // ========== AUDIT LOGGING ==========
    await auditLog('MATERIAL_OUT', 'INVENTORY', projectStock.id, null, {
      material: material.material_name,
      quantity,
      workPackage,
      unit,
      costCenter,
      purpose,
      location,
      newStock
    }, req);

    // ========== RESPONSE ==========
    res.status(201).json({
      success: true,
      message: 'Material out recorded successfully',
      transactionId,
      data: {
        material: {
          id: materialId,
          name: material.material_name,
          unit: material.unit_of_measure
        },
        distribution: {
          workPackage,
          unit: unit || null,
          costCenter: costCenter || null,
          purpose
        },
        stock: {
          quantityOut: quantity,
          previousStock: projectStock.current_qty,
          remainingStock: newStock,
          minStock: projectStock.min_stock
        },
        warning: stockWarning,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    next(error);
  }
}

// Get Material Out History untuk Project
export async function getMaterialOutHistory(req, res, next) {
  try {
    const { projectId } = req.params;
    const { materialId, workPackage, costCenter, startDate, endDate, limit = 50 } = req.query;

    let sql = `
      SELECT 
        st.id as transaction_id,
        st.created_at,
        m.material_name,
        m.unit_of_measure,
        m.unit_price,
        st.qty_change as quantity_out,
        st.reference_work_package as work_package,
        st.reference_unit as unit,
        st.reference_cost_center as cost_center,
        st.purpose,
        st.location,
        st.notes,
        u.full_name as performed_by,
        u.id as performed_by_id,
        ps.current_qty as current_stock_after_out,
        ROUND((st.qty_change * m.unit_price), 2) as estimated_value
       FROM stock_transactions st
       JOIN project_stocks ps ON st.project_stock_id = ps.id
       JOIN materials m ON ps.material_id = m.id
       JOIN users u ON st.performed_by = u.id
       WHERE ps.project_id = $1 AND st.type = 'OUT'
    `;

    const params = [projectId];

    if (materialId) {
      sql += ` AND ps.material_id = $${params.length + 1}`;
      params.push(materialId);
    }

    if (workPackage) {
      sql += ` AND st.reference_work_package ILIKE $${params.length + 1}`;
      params.push(`%${workPackage}%`);
    }

    if (costCenter) {
      sql += ` AND st.reference_cost_center = $${params.length + 1}`;
      params.push(costCenter);
    }

    if (startDate) {
      sql += ` AND st.created_at >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND st.created_at <= $${params.length + 1}`;
      params.push(endDate);
    }

    sql += ` ORDER BY st.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const transactions = await queryAll(sql, params);

    // Calculate statistics
    const stats = {
      totalTransactions: transactions.length,
      totalQuantityOut: transactions.reduce((sum, t) => sum + Math.abs(t.quantity_out), 0),
      totalEstimatedValue: transactions.reduce((sum, t) => sum + (t.estimated_value || 0), 0),
      uniqueWorkPackages: [...new Set(transactions.map(t => t.work_package))].length,
      uniqueCostCenters: [...new Set(transactions.map(t => t.cost_center).filter(Boolean))].length
    };

    res.json({
      success: true,
      stats,
      count: transactions.length,
      data: transactions
    });

  } catch (error) {
    next(error);
  }
}

// Get Material Distribution Details (per work package)
export async function getDistributionSummary(req, res, next) {
  try {
    const { projectId } = req.params;
    const { startDate, endDate } = req.query;

    let sql = `
      SELECT 
        st.reference_work_package as work_package,
        st.reference_unit as unit,
        st.reference_cost_center as cost_center,
        m.material_name,
        m.unit_of_measure,
        m.unit_price,
        SUM(ABS(st.qty_change)) as total_qty,
        COUNT(st.id) as transaction_count,
        string_agg(DISTINCT st.purpose, '; ') as purposes,
        ROUND(SUM(ABS(st.qty_change) * m.unit_price), 2) as total_value,
        MAX(st.created_at) as last_distribution,
        MIN(st.created_at) as first_distribution
       FROM stock_transactions st
       JOIN project_stocks ps ON st.project_stock_id = ps.id
       JOIN materials m ON ps.material_id = m.id
       WHERE ps.project_id = $1 AND st.type = 'OUT'
    `;

    const params = [projectId];

    if (startDate) {
      sql += ` AND st.created_at >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND st.created_at <= $${params.length + 1}`;
      params.push(endDate);
    }

    sql += `
      GROUP BY st.reference_work_package, st.reference_unit, st.reference_cost_center,
               m.material_name, m.unit_of_measure, m.unit_price
      ORDER BY st.reference_work_package, m.material_name
    `;

    const distribution = await queryAll(sql, params);

    // Group by work package for better organization
    const grouped = {};
    distribution.forEach(item => {
      const wp = item.work_package;
      if (!grouped[wp]) {
        grouped[wp] = {
          work_package: wp,
          unit: item.unit,
          cost_center: item.cost_center,
          materials: [],
          totalValue: 0,
          totalTransactions: 0
        };
      }
      grouped[wp].materials.push({
        material: item.material_name,
        unit: item.unit_of_measure,
        quantity: item.total_qty,
        unitPrice: item.unit_price,
        value: item.total_value
      });
      grouped[wp].totalValue += item.total_value || 0;
      grouped[wp].totalTransactions += item.transaction_count;
    });

    res.json({
      success: true,
      count: distribution.length,
      workPackages: Object.values(grouped),
      raw: distribution
    });

  } catch (error) {
    next(error);
  }
}

// Get Material Out by Cost Center (untuk cost tracking)
export async function getMaterialOutByCostCenter(req, res, next) {
  try {
    const { projectId } = req.params;

    const costCenters = await queryAll(
      `
      SELECT 
        st.reference_cost_center as cost_center,
        m.material_name,
        SUM(ABS(st.qty_change)) as total_qty,
        m.unit_of_measure,
        ROUND(SUM(ABS(st.qty_change) * m.unit_price), 2) as total_cost,
        COUNT(st.id) as distribution_count
       FROM stock_transactions st
       JOIN project_stocks ps ON st.project_stock_id = ps.id
       JOIN materials m ON ps.material_id = m.id
       WHERE ps.project_id = $1 AND st.type = 'OUT' AND st.reference_cost_center IS NOT NULL
       GROUP BY st.reference_cost_center, m.material_name, m.unit_of_measure, m.unit_price
       ORDER BY st.reference_cost_center, m.material_name
      `,
      [projectId]
    );

    // Summary by cost center
    const summary = {};
    costCenters.forEach(item => {
      const cc = item.cost_center;
      if (!summary[cc]) {
        summary[cc] = {
          cost_center: cc,
          total_cost: 0,
          materials_count: 0,
          transactions_count: 0,
          materials: []
        };
      }
      summary[cc].materials.push({
        material: item.material_name,
        quantity: item.total_qty,
        unit: item.unit_of_measure,
        cost: item.total_cost
      });
      summary[cc].total_cost += item.total_cost || 0;
      summary[cc].materials_count += 1;
      summary[cc].transactions_count += item.distribution_count;
    });

    res.json({
      success: true,
      costCenters: Object.values(summary),
      raw: costCenters
    });

  } catch (error) {
    next(error);
  }
}

// Verify Material Out Completion (untuk audit)
export async function verifyMaterialOut(req, res, next) {
  try {
    const { transactionId } = req.params;
    const { actualUsage, wasteage, notes } = req.body;

    const transaction = await queryOne(
      `SELECT * FROM stock_transactions WHERE id = $1 AND type = 'OUT'`,
      [transactionId]
    );

    if (!transaction) {
      return res.status(404).json({ error: 'Material out transaction not found' });
    }

    // Update dengan actual usage dan wasteage report
    const updated = await query(
      `UPDATE stock_transactions 
       SET notes = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [
        `ACTUAL USAGE: ${actualUsage || 'N/A'} | WASTEAGE: ${wasteage || 'N/A'} | ${notes || ''}`,
        transactionId
      ]
    );

    await auditLog('VERIFY_MATERIAL_OUT', 'INVENTORY', transactionId, null, {
      actualUsage,
      wasteage,
      notes
    }, req);

    res.json({
      success: true,
      message: 'Material out verification recorded',
      transaction: updated.rows[0]
    });

  } catch (error) {
    next(error);
  }
}

// Get Stock Level After All Material Outs
export async function getStockLevelHistory(req, res, next) {
  try {
    const { projectId, materialId } = req.params;

    const history = await queryAll(
      `
      SELECT 
        st.id,
        st.created_at,
        st.type,
        st.qty_change,
        ABS(st.qty_change) as quantity,
        st.reference_work_package as work_package,
        st.purpose,
        u.full_name as performed_by,
        ps.current_qty as stock_level_after
       FROM stock_transactions st
       JOIN project_stocks ps ON st.project_stock_id = ps.id
       JOIN users u ON st.performed_by = u.id
       WHERE ps.project_id = $1 AND ps.material_id = $2
       ORDER BY st.created_at DESC
      `,
      [projectId, materialId]
    );

    res.json({
      success: true,
      count: history.length,
      data: history
    });

  } catch (error) {
    next(error);
  }
}
