import express from 'express';
import {
  createMaterialOut,
  getMaterialOutHistory,
  getDistributionSummary,
  getMaterialOutByCostCenter,
  verifyMaterialOut,
  getStockLevelHistory,
  getProjectInventory,
  adjustBudgetQuota,
  getBudgetVsActual
} from '../controllers/inventory.js';
import { authenticateToken, authorize, checkProjectAccess } from '../middleware/index.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * ============================================================================
 * INVENTORY MANAGEMENT ROUTES
 * ============================================================================
 * All routes include project access control
 */

// ========== PROJECT INVENTORY STATUS ==========
/**
 * GET /api/inventory/:projectId
 * Get current inventory status for project
 * Returns: current stock, budget remaining, stock status alerts
 * Roles: QS, SPV, PM, PURCHASING, FOREMAN, ADMIN
 */
router.get(
  '/:projectId',
  checkProjectAccess,
  getProjectInventory
);

// ========== BUDGET & QUOTA ==========
/**
 * GET /api/inventory/:projectId/budget-vs-actual
 * Get budget vs actual spending report
 * Returns: planned vs actual usage analysis
 * Roles: QS, PM, PURCHASING, ADMIN
 */
router.get(
  '/:projectId/budget-vs-actual',
  checkProjectAccess,
  authorize('QS', 'PM', 'PURCHASING', 'ADMIN'),
  getBudgetVsActual
);

/**
 * PUT /api/inventory/:projectId/adjust-quota
 * Adjust budget quota for a material (QS only)
 * Body: { materialId, adjustmentQty, reason }
 * Roles: QS, ADMIN
 */
router.put(
  '/:projectId/adjust-quota',
  checkProjectAccess,
  authorize('QS', 'ADMIN'),
  adjustBudgetQuota
);

// ========== MATERIAL OUT TRACKING (DETAILED) ==========
/**
 * ============================================================================
 * CRITICAL FEATURE: MATERIAL OUT WITH MANDATORY DISTRIBUTION TRACKING
 * ============================================================================
 * 
 * BUSINESS REQUIREMENT:
 * Every Material Out (pengambilan material dari stok) MUST include:
 * 1. Work Package (MANDATORY) - Paket pekerjaan mana yang menerima material
 * 2. Purpose (MANDATORY) - Tujuan penggunaan material
 * 3. Quantity validation - Validasi stok tersedia
 * 4. Optional: Unit, Cost Center, Location untuk tracking detail
 * 
 * MANDATORY FIELDS VALIDATION:
 * - reference_work_package: Required for Material Out (prevents unknown distribution)
 * - purpose: Required for Material Out (ensures accountability)
 * - Automatic stock validation: Prevents negative stock (current_qty >= 0)
 * - Row-level locking: Prevents race conditions
 * 
 * USE CASES:
 * 1. Material untuk pekerjaan spesifik di lapangan
 * 2. Distribusi ke cost center tertentu untuk cost tracking
 * 3. Pengeluaran untuk quality control atau testing
 * 4. Material untuk training atau demo
 * ============================================================================
 */

/**
 * POST /api/inventory/:projectId/out
 * Record Material Out with MANDATORY distribution details
 * 
 * REQUIRED FIELDS:
 * - materialId (uuid): Material yang diambil
 * - quantity (int): Jumlah yang diambil
 * - workPackage (string): Paket pekerjaan penerima material (MANDATORY)
 * - purpose (string): Tujuan penggunaan (MANDATORY)
 * 
 * OPTIONAL FIELDS:
 * - unit (string): Unit bangunan (contoh: "Unit A", "Blok 2")
 * - costCenter (string): Kode cost center untuk cost tracking
 * - location (string): Lokasi fisik di site
 * - notes (string): Catatan tambahan (quality, condition, etc)
 * 
 * VALIDATION:
 * ✓ Work package is mandatory (cannot be null/empty)
 * ✓ Purpose is mandatory (cannot be null/empty)
 * ✓ Stock availability check (quantity <= current_qty)
 * ✓ Stock minimum level warning (returns warning if stock drops below min)
 * ✓ ACID transaction (atomic update of stock)
 * ✓ Row-level locking (prevents concurrent modification)
 * ✓ Complete audit trail
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "transactionId": "uuid",
 *   "data": {
 *     "material": { id, name, unit },
 *     "distribution": { workPackage, unit, costCenter, purpose },
 *     "stock": { quantityOut, previousStock, remainingStock, minStock },
 *     "warning": { level, message, remainingQty } // if stock drops low
 *   }
 * }
 * 
 * ERRORS:
 * 400: Work package is mandatory
 * 400: Purpose is mandatory
 * 400: Insufficient stock
 * 404: Material not found in project inventory
 * 
 * ROLES: SPV, FOREMAN, ADMIN
 */
router.post(
  '/:projectId/out',
  checkProjectAccess,
  authorize('SPV', 'FOREMAN', 'ADMIN'),
  createMaterialOut
);

/**
 * GET /api/inventory/:projectId/out-history
 * Get Material Out transaction history with distribution details
 * 
 * QUERY PARAMETERS (all optional):
 * - materialId: Filter by specific material
 * - workPackage: Filter by work package name (partial match)
 * - costCenter: Filter by cost center
 * - startDate: Start date for period (ISO format)
 * - endDate: End date for period (ISO format)
 * - limit: Max records to return (default: 50)
 * 
 * RESPONSE INCLUDES:
 * - All distribution details (work_package, unit, cost_center, purpose, location)
 * - Material info (name, unit, price)
 * - Stock level after out (for traceability)
 * - Performed by (user accountability)
 * - Statistics (total qty, value, transactions)
 * 
 * ROLES: SPV, FOREMAN, PM, PURCHASING, ADMIN
 */
router.get(
  '/:projectId/out-history',
  checkProjectAccess,
  getMaterialOutHistory
);

// ========== DISTRIBUTION & COST TRACKING ==========
/**
 * GET /api/inventory/:projectId/distribution-summary
 * Get material distribution summary grouped by work package
 * 
 * QUERY PARAMETERS:
 * - startDate: Period start (ISO format)
 * - endDate: Period end (ISO format)
 * 
 * RESPONSE STRUCTURE:
 * {
 *   "workPackages": [
 *     {
 *       "work_package": "Basement Foundation - Unit A",
 *       "unit": "Unit A",
 *       "cost_center": null,
 *       "materials": [
 *         {
 *           "material": "Portland Cement",
 *           "quantity": 150,
 *           "unit": "Bag",
 *           "value": 11250000
 *         }
 *       ],
 *       "totalValue": 11250000,
 *       "totalTransactions": 6
 *     }
 *   ]
 * }
 * 
 * USE CASES:
 * - Work package cost analysis
 * - Material efficiency per task
 * - Budget tracking by work package
 * 
 * ROLES: QS, PM, PURCHASING, ADMIN
 */
router.get(
  '/:projectId/distribution-summary',
  checkProjectAccess,
  authorize('QS', 'PM', 'PURCHASING', 'ADMIN'),
  getDistributionSummary
);

/**
 * GET /api/inventory/:projectId/cost-center-report
 * Get material distribution grouped by cost center (for cost tracking)
 * 
 * RESPONSE INCLUDES:
 * - Cost center code
 * - All materials distributed to cost center
 * - Total cost per cost center
 * - Number of distributions
 * 
 * USE CASES:
 * - Cost allocation per department
 * - Financial reporting by cost center
 * - Budget control per cost center
 * 
 * ROLES: QS, PM, PURCHASING, ADMIN
 */
router.get(
  '/:projectId/cost-center-report',
  checkProjectAccess,
  authorize('QS', 'PM', 'PURCHASING', 'ADMIN'),
  getMaterialOutByCostCenter
);

/**
 * GET /api/inventory/:projectId/material/:materialId/stock-history
 * Get complete stock level history for a material
 * Shows all IN and OUT transactions
 * 
 * RESPONSE INCLUDES:
 * - Transaction type (IN/OUT)
 * - Quantity changed
 * - Work package (for OUT)
 * - Stock level after transaction
 * - Performed by (user)
 * 
 * ROLES: SPV, PM, PURCHASING, ADMIN
 */
router.get(
  '/:projectId/material/:materialId/stock-history',
  checkProjectAccess,
  getStockLevelHistory
);

// ========== MATERIAL OUT VERIFICATION & COMPLETION ==========
/**
 * PUT /api/inventory/out/:transactionId/verify
 * Verify Material Out completion (record actual usage vs wasteage)
 * 
 * BODY:
 * {
 *   "actualUsage": "120 bags used for concrete pouring",
 *   "wasteage": "3 bags damaged",
 *   "notes": "Quality control passed"
 * }
 * 
 * PURPOSE:
 * - Final accountability after material has been used
 * - Record actual vs expected usage
 * - Track wasteage and efficiency
 * 
 * ROLES: FOREMAN, SPV, ADMIN
 */
router.put(
  '/out/:transactionId/verify',
  authorize('SPV', 'FOREMAN', 'ADMIN'),
  verifyMaterialOut
);

export default router;
