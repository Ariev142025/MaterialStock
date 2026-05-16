import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { queryOne, queryAll } from '../database/connection.js';
import { format } from 'date-fns';

// Generate Request Summary Report
export async function generateRequestSummaryReport(req, res, next) {
  try {
    const { projectId } = req.params;
    const { format: outputFormat = 'pdf', startDate, endDate } = req.query;

    const project = await queryOne(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    let sql = `
      SELECT 
        mr.id,
        mr.request_no,
        mr.status,
        mr.created_at,
        u.full_name as requested_by,
        COUNT(ri.id) as item_count,
        SUM(ri.requested_qty) as total_qty_requested,
        SUM(ri.received_qty) as total_qty_received
       FROM material_requests mr
       JOIN users u ON mr.requested_by = u.id
       LEFT JOIN request_items ri ON mr.id = ri.request_id
       WHERE mr.project_id = $1
    `;

    const params = [projectId];

    if (startDate) {
      sql += ` AND mr.created_at >= $${params.length + 1}`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND mr.created_at <= $${params.length + 1}`;
      params.push(endDate);
    }

    sql += ` GROUP BY mr.id, u.id ORDER BY mr.created_at DESC`;

    const requests = await queryAll(sql, params);

    if (outputFormat === 'excel') {
      return generateExcelReport(res, project, requests, 'Request Summary');
    } else {
      return generatePDFReport(res, project, requests, 'Request Summary');
    }
  } catch (error) {
    next(error);
  }
}

// Generate Inventory Report
export async function generateInventoryReport(req, res, next) {
  try {
    const { projectId } = req.params;
    const { format: outputFormat = 'pdf' } = req.query;

    const project = await queryOne(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    const inventory = await queryAll(
      `SELECT 
        m.material_name,
        m.unit_of_measure,
        m.unit_price,
        mb.initial_qty,
        mb.remaining_qty,
        ps.current_qty,
        ROUND(((mb.initial_qty - COALESCE(ps.current_qty, 0))::float / mb.initial_qty * 100), 2) as usage_percentage
       FROM material_budgets mb
       JOIN materials m ON mb.material_id = m.id
       LEFT JOIN project_stocks ps ON ps.project_id = mb.project_id AND ps.material_id = mb.material_id
       WHERE mb.project_id = $1
       ORDER BY m.material_name`,
      [projectId]
    );

    if (outputFormat === 'excel') {
      return generateExcelInventoryReport(res, project, inventory);
    } else {
      return generatePDFInventoryReport(res, project, inventory);
    }
  } catch (error) {
    next(error);
  }
}

// Generate Material Distribution Report
export async function generateDistributionReport(req, res, next) {
  try {
    const { projectId } = req.params;
    const { format: outputFormat = 'pdf', startDate, endDate } = req.query;

    const project = await queryOne(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    let sql = `
      SELECT 
        st.reference_work_package as work_package,
        m.material_name,
        m.unit_of_measure,
        SUM(-st.qty_change) as qty_distributed,
        st.purpose,
        COUNT(*) as transaction_count,
        MAX(st.created_at) as last_distribution
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

    sql += ` GROUP BY st.reference_work_package, m.material_name, m.unit_of_measure, st.purpose
             ORDER BY st.reference_work_package, m.material_name`;

    const distributions = await queryAll(sql, params);

    if (outputFormat === 'excel') {
      return generateExcelDistributionReport(res, project, distributions);
    } else {
      return generatePDFDistributionReport(res, project, distributions);
    }
  } catch (error) {
    next(error);
  }
}

// PDF Generation Helper
function generatePDFReport(res, project, data, reportTitle) {
  const doc = new PDFDocument();
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report-${Date.now()}.pdf"`);

  doc.pipe(res);

  // Header
  doc.fontSize(20).font('Helvetica-Bold').text('MATERIAL STOCK MONITORING REPORT', 50, 50);
  doc.fontSize(12).font('Helvetica').text(reportTitle, 50, 80);
  
  // Company header (customize dengan logo perusahaan)
  doc.fontSize(10).text('PT. [COMPANY NAME]', 50, 110);
  doc.text(`Project: ${project.project_name}`, 50, 130);
  doc.text(`Code: ${project.project_code}`, 50, 150);
  doc.text(`Date: ${format(new Date(), 'dd/MM/yyyy')}`, 50, 170);

  // Table content
  doc.moveTo(50, 200).lineTo(550, 200).stroke();
  
  let yPosition = 220;
  const rowHeight = 20;

  // Table headers
  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('No', 50, yPosition);
  doc.text('Description', 100, yPosition);
  doc.text('Status', 350, yPosition);
  doc.text('Qty', 450, yPosition);

  yPosition += rowHeight;
  doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();

  // Table rows
  doc.font('Helvetica');
  data.forEach((item, index) => {
    if (yPosition > 700) {
      doc.addPage();
      yPosition = 50;
    }
    doc.text((index + 1).toString(), 50, yPosition);
    doc.text(item.material_name || item.request_no || item.reference_work_package, 100, yPosition, { width: 250 });
    doc.text(item.status || 'N/A', 350, yPosition);
    doc.text((item.total_qty_requested || item.current_qty || '-').toString(), 450, yPosition);
    yPosition += rowHeight;
  });

  // Footer
  doc.fontSize(8).text('Generated by Material Stock Monitoring System', 50, 750);
  doc.text(`Report Date: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, 50, 765);

  doc.end();
}

// PDF Inventory Report
function generatePDFInventoryReport(res, project, inventory) {
  const doc = new PDFDocument();
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="inventory-${Date.now()}.pdf"`);

  doc.pipe(res);

  doc.fontSize(20).font('Helvetica-Bold').text('INVENTORY STATUS REPORT', 50, 50);
  doc.fontSize(12).font('Helvetica').text('Material Stock Summary', 50, 80);
  
  doc.fontSize(10).text(`Project: ${project.project_name}`, 50, 110);
  doc.text(`Date: ${format(new Date(), 'dd/MM/yyyy')}`, 50, 130);

  let yPosition = 160;
  const rowHeight = 25;

  // Headers
  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('Material', 50, yPosition);
  doc.text('Planned', 150, yPosition);
  doc.text('On-Site', 250, yPosition);
  doc.text('Used', 350, yPosition);
  doc.text('Usage %', 450, yPosition);

  yPosition += rowHeight;
  doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();

  // Rows
  doc.font('Helvetica');
  inventory.forEach((item) => {
    if (yPosition > 700) {
      doc.addPage();
      yPosition = 50;
    }
    doc.text(item.material_name.substring(0, 20), 50, yPosition);
    doc.text(item.initial_qty.toString(), 150, yPosition);
    doc.text((item.current_qty || 0).toString(), 250, yPosition);
    doc.text((item.initial_qty - (item.current_qty || 0)).toString(), 350, yPosition);
    doc.text((item.usage_percentage || 0) + '%', 450, yPosition);
    yPosition += rowHeight;
  });

  doc.fontSize(8).text('Generated by Material Stock Monitoring System', 50, 750);
  doc.end();
}

// PDF Distribution Report
function generatePDFDistributionReport(res, project, distributions) {
  const doc = new PDFDocument();
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="distribution-${Date.now()}.pdf"`);

  doc.pipe(res);

  doc.fontSize(20).font('Helvetica-Bold').text('MATERIAL DISTRIBUTION REPORT', 50, 50);
  doc.fontSize(10).text(`Project: ${project.project_name}`, 50, 80);
  doc.text(`Date: ${format(new Date(), 'dd/MM/yyyy')}`, 50, 100);

  let yPosition = 140;
  const rowHeight = 30;

  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('Work Package', 50, yPosition);
  doc.text('Material', 180, yPosition);
  doc.text('Qty', 380, yPosition);
  doc.text('Purpose', 430, yPosition);

  yPosition += rowHeight;
  doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();

  doc.font('Helvetica');
  distributions.forEach((dist) => {
    if (yPosition > 700) {
      doc.addPage();
      yPosition = 50;
    }
    doc.text(dist.work_package.substring(0, 20), 50, yPosition);
    doc.text(dist.material_name.substring(0, 20), 180, yPosition);
    doc.text(dist.qty_distributed.toString(), 380, yPosition);
    doc.text(dist.purpose?.substring(0, 30) || '-', 430, yPosition);
    yPosition += rowHeight;
  });

  doc.fontSize(8).text('Generated by Material Stock Monitoring System', 50, 750);
  doc.end();
}

// Excel Report Generators
async function generateExcelReport(res, project, data, sheetName) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.columns = [
    { header: 'Request No', key: 'request_no', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Requested By', key: 'requested_by', width: 20 },
    { header: 'Items', key: 'item_count', width: 10 },
    { header: 'Requested Qty', key: 'total_qty_requested', width: 15 },
    { header: 'Received Qty', key: 'total_qty_received', width: 15 },
    { header: 'Date', key: 'created_at', width: 15 }
  ];

  worksheet.addRows(data);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="report-${Date.now()}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
}

async function generateExcelInventoryReport(res, project, inventory) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Inventory');

  worksheet.columns = [
    { header: 'Material Name', key: 'material_name', width: 30 },
    { header: 'Unit', key: 'unit_of_measure', width: 10 },
    { header: 'Unit Price', key: 'unit_price', width: 15 },
    { header: 'Planned Qty', key: 'initial_qty', width: 12 },
    { header: 'Remaining Budget', key: 'remaining_qty', width: 15 },
    { header: 'On-Site Qty', key: 'current_qty', width: 12 },
    { header: 'Usage %', key: 'usage_percentage', width: 10 }
  ];

  worksheet.addRows(inventory);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="inventory-${Date.now()}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
}

async function generateExcelDistributionReport(res, project, distributions) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Distribution');

  worksheet.columns = [
    { header: 'Work Package', key: 'work_package', width: 25 },
    { header: 'Material', key: 'material_name', width: 30 },
    { header: 'Unit', key: 'unit_of_measure', width: 10 },
    { header: 'Qty Distributed', key: 'qty_distributed', width: 15 },
    { header: 'Purpose', key: 'purpose', width: 40 },
    { header: 'Transactions', key: 'transaction_count', width: 10 }
  ];

  worksheet.addRows(distributions);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="distribution-${Date.now()}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
}
