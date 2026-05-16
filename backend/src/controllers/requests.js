import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, queryAll, executeTransaction, insert } from '../database/connection.js';
import { auditLog } from '../middleware/index.js';

// Create material request
export async function createRequest(req, res, next) {
  try {
    const { projectId, items, notes } = req.body;
    const userId = req.user.id;

    // Validate project exists
    const project = await queryOne(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Validate and check budget for each item
    for (const item of items) {
      const material = await queryOne(
        'SELECT * FROM materials WHERE id = $1',
        [item.materialId]
      );

      if (!material) {
        return res.status(404).json({ error: `Material ${item.materialId} not found` });
      }

      const budget = await queryOne(
        'SELECT remaining_qty FROM material_budgets WHERE project_id = $1 AND material_id = $2',
        [projectId, item.materialId]
      );

      if (!budget || budget.remaining_qty < item.requestedQty) {
        return res.status(400).json({
          error: `Insufficient budget quota for ${material.material_name}`,
          material: material.material_name,
          requested: item.requestedQty,
          available: budget?.remaining_qty || 0
        });
      }
    }

    // Execute transaction for creating request
    const requestId = await executeTransaction(async (client) => {
      const newRequestId = uuidv4();
      const requestNo = `REQ-${projectId.substring(0, 8)}-${Date.now()}`;

      // Create request header
      const request = await client.query(
        `INSERT INTO material_requests 
         (id, project_id, request_no, requested_by, status, current_stage, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [newRequestId, projectId, requestNo, userId, 'PENDING', 'QS', notes]
      );

      // Create request items
      for (const item of items) {
        await client.query(
          `INSERT INTO request_items 
           (request_id, material_id, requested_qty)
           VALUES ($1, $2, $3)`,
          [newRequestId, item.materialId, item.requestedQty]
        );
      }

      return newRequestId;
    });

    // Audit log
    await auditLog('CREATE', 'MATERIAL_REQUEST', requestId, null, { items }, req);

    res.status(201).json({
      success: true,
      message: 'Material request created',
      requestId
    });
  } catch (error) {
    next(error);
  }
}

// Get all requests for project
export async function getProjectRequests(req, res, next) {
  try {
    const { projectId } = req.params;
    const { status, stage } = req.query;

    let sql = `
      SELECT 
        mr.*,
        u.full_name as requested_by_name,
        COUNT(ri.id) as item_count
      FROM material_requests mr
      JOIN users u ON mr.requested_by = u.id
      LEFT JOIN request_items ri ON mr.id = ri.request_id
      WHERE mr.project_id = $1
    `;
    const params = [projectId];

    if (status) {
      sql += ` AND mr.status = $${params.length + 1}`;
      params.push(status);
    }

    if (stage) {
      sql += ` AND mr.current_stage = $${params.length + 1}`;
      params.push(stage);
    }

    sql += ` GROUP BY mr.id, u.id ORDER BY mr.created_at DESC`;

    const requests = await queryAll(sql, params);

    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    next(error);
  }
}

// Get request details with items
export async function getRequestDetails(req, res, next) {
  try {
    const { requestId } = req.params;

    const request = await queryOne(
      `SELECT mr.*, u.full_name as requested_by_name
       FROM material_requests mr
       JOIN users u ON mr.requested_by = u.id
       WHERE mr.id = $1`,
      [requestId]
    );

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const items = await queryAll(
      `SELECT ri.*, m.material_name, m.unit_of_measure
       FROM request_items ri
       JOIN materials m ON ri.material_id = m.id
       WHERE ri.request_id = $1`,
      [requestId]
    );

    res.json({
      success: true,
      request,
      items
    });
  } catch (error) {
    next(error);
  }
}

// Verify request (PM approval)
export async function verifyRequest(req, res, next) {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    const request = await queryOne(
      'SELECT * FROM material_requests WHERE id = $1',
      [requestId]
    );

    if (!request || request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invalid request status for verification' });
    }

    const updated = await executeTransaction(async (client) => {
      return await client.query(
        `UPDATE material_requests 
         SET status = $1, current_stage = $2, verified_by = $3, verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        ['VERIFIED', 'PM', userId, requestId]
      );
    });

    await auditLog('VERIFY', 'MATERIAL_REQUEST', requestId, request, updated.rows[0], req);

    res.json({
      success: true,
      message: 'Request verified',
      request: updated.rows[0]
    });
  } catch (error) {
    next(error);
  }
}

// Receive materials (SPV site checklist)
export async function receiveRequest(req, res, next) {
  try {
    const { requestId } = req.params;
    const { items: receivedItems } = req.body;

    const request = await queryOne(
      'SELECT * FROM material_requests WHERE id = $1',
      [requestId]
    );

    if (!request || request.status !== 'PROCESSING') {
      return res.status(400).json({ error: 'Invalid request status for receiving' });
    }

    await executeTransaction(async (client) => {
      // Update received quantities
      for (const item of receivedItems) {
        await client.query(
          `UPDATE request_items 
           SET received_qty = $1, site_comment = $2, rejection_status = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [item.receivedQty, item.siteComment, item.rejectionStatus, item.itemId]
        );
      }

      // Change status to Ready for Close
      await client.query(
        `UPDATE material_requests 
         SET status = $1, current_stage = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        ['READY_FOR_CLOSE', 'SITE', requestId]
      );
    });

    await auditLog('RECEIVE', 'MATERIAL_REQUEST', requestId, null, receivedItems, req);

    res.json({
      success: true,
      message: 'Materials received and checklist completed'
    });
  } catch (error) {
    next(error);
  }
}

// Close request with ACID dual-inventory update
export async function closeRequest(req, res, next) {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    const request = await queryOne(
      'SELECT * FROM material_requests WHERE id = $1',
      [requestId]
    );

    if (!request || request.status !== 'READY_FOR_CLOSE') {
      return res.status(400).json({ error: 'Invalid request status for closing' });
    }

    // ACID Transaction: Update budget quota and on-site stock simultaneously
    await executeTransaction(async (client) => {
      const items = await client.query(
        `SELECT ri.*, m.unit_of_measure FROM request_items ri
         JOIN materials m ON ri.material_id = m.id
         WHERE ri.request_id = $1`,
        [requestId]
      );

      for (const item of items.rows) {
        const receivedQty = item.received_qty || 0;

        // 1. Reduce budget quota
        await client.query(
          `UPDATE material_budgets 
           SET remaining_qty = remaining_qty - $1, updated_at = CURRENT_TIMESTAMP
           WHERE project_id = $2 AND material_id = $3`,
          [receivedQty, request.project_id, item.material_id]
        );

        // 2. Increase on-site stock
        const stock = await client.query(
          `SELECT id FROM project_stocks 
           WHERE project_id = $1 AND material_id = $2
           FOR UPDATE`,
          [request.project_id, item.material_id]
        );

        if (stock.rows.length === 0) {
          // Create new stock entry if not exists
          await client.query(
            `INSERT INTO project_stocks (id, project_id, material_id, current_qty)
             VALUES ($1, $2, $3, $4)`,
            [uuidv4(), request.project_id, item.material_id, receivedQty]
          );
        } else {
          await client.query(
            `UPDATE project_stocks 
             SET current_qty = current_qty + $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [receivedQty, stock.rows[0].id]
          );
        }

        // 3. Record Material IN transaction
        await client.query(
          `INSERT INTO stock_transactions 
           (id, project_stock_id, request_id, type, qty_change, reference_doc, purpose, performed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            uuidv4(),
            stock.rows[0]?.id || uuidv4(),
            requestId,
            'IN',
            receivedQty,
            request.request_no,
            'Stock received from supplier',
            userId
          ]
        );
      }

      // 4. Update request status to CLOSED
      await client.query(
        `UPDATE material_requests 
         SET status = $1, current_stage = $2, closed_by = $3, closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        ['CLOSED', 'CLOSED', userId, requestId]
      );
    });

    await auditLog('CLOSE', 'MATERIAL_REQUEST', requestId, null, { status: 'CLOSED' }, req);

    res.json({
      success: true,
      message: 'Request closed - Budget quota and on-site stock updated'
    });
  } catch (error) {
    next(error);
  }
}

// Reject request
export async function rejectRequest(req, res, next) {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;

    const request = await queryOne(
      'SELECT * FROM material_requests WHERE id = $1',
      [requestId]
    );

    if (!request || !['PENDING', 'VERIFIED', 'PROCESSING'].includes(request.status)) {
      return res.status(400).json({ error: 'Invalid request status for rejection' });
    }

    const updated = await executeTransaction(async (client) => {
      return await client.query(
        `UPDATE material_requests 
         SET status = $1, notes = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        ['REJECTED', reason, requestId]
      );
    });

    await auditLog('REJECT', 'MATERIAL_REQUEST', requestId, null, { reason }, req);

    res.json({
      success: true,
      message: 'Request rejected',
      request: updated.rows[0]
    });
  } catch (error) {
    next(error);
  }
}
