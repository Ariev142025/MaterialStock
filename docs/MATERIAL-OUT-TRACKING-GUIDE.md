# 📋 Material Out Tracking - Dokumentasi Lengkap (Enhanced)

## Overview

**Material Out Tracking** adalah fitur kritis dalam sistem Material Stock Monitoring yang mencatat setiap pengambilan material dari stok dengan detail distribusi yang lengkap dan akurat.

### Key Requirement (dari PRD)
> "Setiap pengeluaran material (Material Out) wajib mencantumkan tujuan penggunaan spesifik (paket pekerjaan, unit bangunan, atau cost center). Sistem mencatat detail distribusi untuk pelacakan biaya, efisiensi lapangan, dan pencegahan penyalahgunaan stok."

---

## 🎯 Mandatory Fields untuk Material Out

Setiap pengambilan material **WAJIB** menyertakan:

### 1. **Work Package** (MANDATORY)
- **Tujuan**: Mengidentifikasi paket pekerjaan/task mana yang menerima material
- **Format**: String (min 5 karakter, max 255)
- **Contoh**:
  - "Basement Foundation - Unit A"
  - "Concrete Slab Floor 3"
  - "Structural Beam Assembly Block B"
  - "Finishing Works Apartment 5A"
- **Business Logic**: Tanpa ini, material hilang tanpa jejak (audit risk)
- **Database Column**: `stock_transactions.reference_work_package`

### 2. **Purpose** (MANDATORY)
- **Tujuan**: Menjelaskan apa tujuan penggunaan material tersebut
- **Format**: Text (min 10 karakter, max 500)
- **Contoh**:
  - "Concrete pouring untuk pondasi utama sesuai drawing REV-2"
  - "Formwork assembly untuk floor slab"
  - "Quality control testing specimen"
  - "Training material untuk new workers"
- **Business Logic**: Memastikan accountability dan mencegah penyalahgunaan
- **Database Column**: `stock_transactions.purpose`

### 3. **Quantity** (MANDATORY)
- **Tujuan**: Jumlah material yang diambil
- **Validasi**: Tidak boleh melebihi current stock
- **Auto-check**: Sistem otomatis validasi vs available stock
- **Warning**: Alert jika stock akan jatuh ke level critical/low
- **Prevention**: Reject jika quantity > current stock (negative stock blocking)

---

## 📊 Optional Fields untuk Detail Tracking

### 4. **Unit / Building Designation** (OPTIONAL)
- **Contoh**: "Unit 01", "Blok A", "Lantai 3"
- **Kegunaan**: Tracking lebih spesifik dalam building yang sama
- **Database Column**: `stock_transactions.reference_unit`

### 5. **Cost Center Code** (OPTIONAL)
- **Contoh**: "CC-01", "CIVIL", "MEP", "STRUCTURAL"
- **Kegunaan**: Cost allocation per department/division
- **Business Use**: Financial reporting & budget control per cost center
- **Database Column**: `stock_transactions.reference_cost_center`

### 6. **Physical Location** (OPTIONAL)
- **Contoh**: "Site A - North Area", "Workshop Storage", "Quarantine Area"
- **Kegunaan**: Physical accountability di site
- **Database Column**: `stock_transactions.location`

### 7. **Notes** (OPTIONAL)
- **Contoh**: "Condition: Good", "Quality check: Passed", "Partial damage: 2 bags"
- **Kegunaan**: Catatan tambahan untuk completeness
- **Database Column**: `stock_transactions.notes`

---

## 🔄 Material Out Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SPV/FOREMAN INITIATES MATERIAL OUT                           │
│    - Select material from inventory                             │
│    - System displays current stock & min level                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. FILL MANDATORY FIELDS                                        │
│    ✓ Work Package (paket pekerjaan)                            │
│    ✓ Purpose (tujuan penggunaan)                               │
│    ✓ Quantity (jumlah)                                         │
│    - Fill optional fields if applicable                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. SYSTEM VALIDATION                                            │
│    ✓ Quantity <= Current Stock (prevent negative stock)        │
│    ✓ Work Package not null/empty                               │
│    ✓ Purpose not null/empty                                    │
│    → Calculate remaining stock & check min level               │
│    → Generate warning if stock drops to critical/low           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. REVIEW SUMMARY & SUBMIT                                      │
│    Show preview:                                                │
│    - Material name, quantity, unit                              │
│    - Work package, purpose, cost center                        │
│    - Stock before & after                                      │
│    - Any warnings/alerts                                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. ACID TRANSACTION (Backend)                                   │
│    [ATOMIC - All or Nothing]                                   │
│    a) Lock row in project_stocks (SELECT FOR UPDATE)           │
│    b) Validate stock again (double-check after lock)           │
│    c) Reduce current_qty                                        │
│    d) Record transaction dengan all distribution details       │
│    e) Audit log created                                        │
│    f) COMMIT or ROLLBACK                                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. CONFIRMATION & NOTIFICATION                                  │
│    - Show transaction ID                                        │
│    - Display remaining stock                                    │
│    - Send real-time notification                               │
│    - Redirect to inventory page                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 💾 Database Schema Changes

### stock_transactions Table (Enhanced)

```sql
CREATE TABLE stock_transactions (
    id UUID PRIMARY KEY,
    project_stock_id UUID NOT NULL,
    request_id UUID,
    
    -- Transaction type
    type VARCHAR(10) CHECK (type IN ('IN', 'OUT')),
    qty_change INT NOT NULL,
    
    -- MANDATORY FIELDS FOR MATERIAL OUT
    reference_work_package VARCHAR(255),          -- MANDATORY
    purpose TEXT NOT NULL,                        -- MANDATORY
    
    -- OPTIONAL FIELDS FOR DETAIL TRACKING
    reference_unit VARCHAR(100),                  -- Optional
    reference_cost_center VARCHAR(50),            -- Optional
    location VARCHAR(255),                        -- Optional
    
    -- Additional tracking
    notes TEXT,
    actual_usage TEXT,
    wasteage_notes TEXT,
    
    -- Audit
    performed_by UUID NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    -- CONSTRAINTS: Enforce mandatory fields for OUT
    CONSTRAINT material_out_requires_work_package CHECK (
        type = 'IN' OR (type = 'OUT' AND reference_work_package IS NOT NULL)
    ),
    CONSTRAINT material_out_requires_purpose CHECK (
        type = 'IN' OR (type = 'OUT' AND purpose IS NOT NULL AND length(purpose) > 0)
    )
);
```

### Views untuk Reporting

#### vw_material_distribution_detail
- Track material per work package
- Show all distribution details
- Enable cost analysis by work package

#### vw_cost_center_material_cost
- Aggregate cost by cost center
- Financial reporting
- Budget control per department

#### vw_work_package_distribution
- Summary per work package
- Material count & total value
- Transaction history per task

---

## 🔌 API Endpoints (Enhanced)

### 1. Create Material Out
```
POST /api/inventory/:projectId/out

BODY:
{
  "materialId": "uuid",
  "quantity": 50,
  "workPackage": "Basement Foundation - Unit A",    // MANDATORY
  "purpose": "Concrete pouring untuk pondasi",      // MANDATORY
  "unit": "Unit A",                                  // Optional
  "costCenter": "CC-01",                            // Optional
  "location": "Site A - North Area",                // Optional
  "notes": "Quality check passed"                    // Optional
}

RESPONSE:
{
  "success": true,
  "transactionId": "uuid",
  "data": {
    "material": { id, name, unit },
    "distribution": { workPackage, unit, costCenter, purpose },
    "stock": { quantityOut, previousStock, remainingStock, minStock },
    "warning": { level, message, remainingQty }  // if applicable
  }
}
```

### 2. Get Material Out History
```
GET /api/inventory/:projectId/out-history
  ?materialId=uuid
  &workPackage=Basement
  &costCenter=CC-01
  &startDate=2024-01-01
  &endDate=2024-01-31
  &limit=50

RESPONSE:
{
  "success": true,
  "stats": {
    "totalTransactions": 45,
    "totalQuantityOut": 1250,
    "totalEstimatedValue": 18750000,
    "uniqueWorkPackages": 8,
    "uniqueCostCenters": 3
  },
  "data": [
    {
      "transaction_id": "uuid",
      "created_at": "2024-01-20T14:30:00Z",
      "material_name": "Portland Cement",
      "quantity_out": 50,
      "work_package": "Basement Foundation - Unit A",
      "unit": "Unit A",
      "cost_center": "CC-01",
      "purpose": "Concrete pouring",
      "location": "Site A - North Area",
      "performed_by": "Ahmad Rizki",
      "current_stock_after_out": 450,
      "estimated_value": 3750000
    }
  ]
}
```

### 3. Get Distribution Summary
```
GET /api/inventory/:projectId/distribution-summary
  ?startDate=2024-01-01
  &endDate=2024-01-31

RESPONSE:
{
  "success": true,
  "workPackages": [
    {
      "work_package": "Basement Foundation - Unit A",
      "unit": "Unit A",
      "cost_center": null,
      "materials": [
        {
          "material": "Portland Cement",
          "quantity": 150,
          "unit": "Bag",
          "value": 11250000
        }
      ],
      "totalValue": 11250000,
      "totalTransactions": 6
    }
  ]
}
```

### 4. Get Cost Center Report
```
GET /api/inventory/:projectId/cost-center-report

RESPONSE:
{
  "success": true,
  "costCenters": [
    {
      "cost_center": "CC-01",
      "total_cost": 45000000,
      "materials_count": 5,
      "transactions_count": 23,
      "materials": [
        {
          "material": "Portland Cement",
          "quantity": 200,
          "unit": "Bag",
          "cost": 15000000
        }
      ]
    }
  ]
}
```

---

## 🛡️ Validation & Security

### Frontend Validation
✓ Required field check (work package, purpose)
✓ Minimum length validation
✓ Stock availability display
✓ Real-time stock warning

### Backend Validation
✓ Mandatory field enforcement
✓ Stock availability check
✓ Row-level locking (SELECT FOR UPDATE)
✓ ACID transaction guarantee
✓ Audit logging for all operations
✓ User role verification

### Database Constraints
✓ CHECK constraints untuk mandatory fields
✓ NOT NULL constraints
✓ Foreign key references
✓ Data integrity triggers

---

## 📊 Material Out Summary Table (New)

```sql
CREATE TABLE material_out_summary (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    material_id UUID NOT NULL,
    work_package VARCHAR(255) NOT NULL,
    unit VARCHAR(100),
    cost_center VARCHAR(50),
    total_qty INT NOT NULL DEFAULT 0,
    total_transactions INT NOT NULL DEFAULT 0,
    total_cost DECIMAL(15, 2),
    last_updated TIMESTAMP,
    UNIQUE(project_id, material_id, work_package)
);
```

**Purpose**: Quick access to aggregated material out data per work package
**Auto-updated**: Trigger function updates on each Material OUT transaction
**Use Case**: Dashboard, reports, real-time monitoring

---

## 📈 Reporting & Analytics

### 1. Material Out History Report
- **For**: SPV, Foreman, Purchasing
- **Data**: Complete transaction history with all distribution details
- **Filter**: By material, work package, cost center, date range
- **Export**: PDF/Excel

### 2. Distribution Summary Report
- **For**: PM, Purchasing, Finance
- **Data**: Material usage per work package
- **Metrics**: Total quantity, total cost, transaction count
- **Grouping**: By work package, unit, cost center

### 3. Cost Center Report
- **For**: Finance, Project Controller
- **Data**: Material cost aggregation per cost center
- **Use**: Cost allocation, budget control, financial reporting
- **Analysis**: Spend by department/division

### 4. Stock Level History
- **For**: SPV, Inventory Manager
- **Data**: Complete stock movement history
- **Detail**: All IN and OUT with remaining stock after each transaction
- **Traceability**: Who did what when

---

## 🎓 User Scenarios

### Scenario 1: Basement Concrete Pouring
```
1. SPV mendapat material untuk pouring pondasi basement
   Material: Portland Cement, 100 bags
   Work Package: "Basement Foundation - Unit A"
   Purpose: "Concrete pouring untuk pondasi utama"
   Cost Center: "CC-01" (Structural)
   Location: "Site A - North Area"

2. System records:
   - Reduces current_qty from 300 to 200
   - Creates transaction with full distribution details
   - Alert: Stock remaining 200 bags (still above min 50)

3. Later, report shows:
   - 100 bags used for Basement Foundation
   - Cost: 7,500,000 IDR allocated to CC-01
```

### Scenario 2: Quality Control Testing
```
1. Engineer mengambil material untuk testing
   Material: Steel Rebar, 5 pieces
   Work Package: "Quality Control Test Specimen"
   Purpose: "Tensile strength testing per SNI standard"
   Cost Center: "CC-QA" (Quality Assurance)
   Location: "Testing Lab"

2. System records:
   - Separate tracking untuk QC vs production use
   - Alert: Used 5 pieces, remaining 45 (above min 10)

3. Report shows:
   - Separate QC cost tracking
   - Efficiency analysis: cost per test
```

### Scenario 3: Training Material
```
1. Trainer mengambil material untuk training
   Material: Scaffolding Components, 10 units
   Work Package: "Worker Safety Training Program"
   Purpose: "Hands-on training untuk assembly & dismantling"
   Location: "Training Area"

2. System records:
   - Non-production use clearly marked
   - For cost analysis: distinguish training vs production

3. Report shows:
   - Separate tracking untuk training cost
```

---

## ⚠️ Error Handling & Messages

### User-Friendly Error Messages

```javascript
// Missing Work Package
{
  "error": "Work package is mandatory",
  "field": "workPackage",
  "details": "Setiap pengambilan material wajib menyertakan tujuan penggunaan (paket pekerjaan)"
}

// Missing Purpose
{
  "error": "Purpose of use is mandatory",
  "field": "purpose",
  "details": "Jelaskan tujuan penggunaan material (concrete, formwork, etc)"
}

// Insufficient Stock
{
  "error": "Insufficient stock for material out",
  "material": "Portland Cement",
  "requested": 150,
  "available": 75,
  "unit": "Bag"
}

// Stock Level Warnings
{
  "level": "CRITICAL",
  "message": "Stock will reach critical level",
  "remainingQty": 5,
  "minStock": 10
}
```

---

## 🔍 Audit Trail

Setiap Material Out transaction direkam lengkap:

```
- Transaction ID: Unique identifier
- Material: Name, unit, price
- Quantity: Amount taken
- Distribution: Work package, unit, cost center, purpose
- Location: Physical location at site
- Performed By: User who recorded
- Timestamp: Exact date & time
- Stock Level After: Remaining stock immediately after
- IP Address: Source of request
- Notes: Any additional information
```

---

## 💡 Best Practices

### For SPV/Foreman
1. ✓ Fill work package accurately - jangan generic/vague
2. ✓ Be specific with purpose - "concrete pouring" adalah clear, "material untuk pekerjaan" adalah vague
3. ✓ Include cost center jika available - helps finance team
4. ✓ Review warning messages jika stock drops low
5. ✓ Keep location field updated untuk physical accountability

### For Finance/Controller
1. ✓ Use cost center for cost allocation
2. ✓ Regular review of distribution reports
3. ✓ Analyze cost per work package
4. ✓ Reconcile physical vs book inventory
5. ✓ Monitor for unusually high Material Out quantities

### For Project Manager
1. ✓ Review distribution reports weekly
2. ✓ Check cost center allocations
3. ✓ Analyze efficiency per work package
4. ✓ Identify high-waste activities
5. ✓ Cross-check with project schedule

---

## 📝 Configuration & Customization

### Mandatory Fields
Saat ini hardcoded:
- `workPackage` - MANDATORY
- `purpose` - MANDATORY
- `quantity` - MANDATORY

Dapat dikustomisasi di schema/controller jika diperlukan.

### Field Lengths
```javascript
workPackage: max 255 characters
purpose: max 500 characters
unit: max 100 characters
costCenter: max 50 characters
location: max 255 characters
```

Dapat diubah di validation schema sesuai kebutuhan.

### Stock Warnings
```javascript
minStockLevel = min_stock
lowStockWarningLevel = min_stock * 1.5
criticalStockLevel = min_stock
```

Dapat disesuaikan per material atau per project.

---

## 🔗 Related Features

- **Material In Tracking**: Automatically recorded saat closing request
- **Budget Management**: Validates against remaining quota
- **Inventory Dashboard**: Real-time stock display
- **Audit Logging**: Complete activity tracking
- **Reporting**: Comprehensive distribution reports
- **Cost Tracking**: Cost center allocation

---

## 📞 Support & Troubleshooting

### Common Issues

**Q: Work package field not accepting my input**
A: Minimum 5 characters required. Be more specific.

**Q: Cannot record material out - insufficient stock**
A: Check current stock. Cannot take more than available. Reduce quantity or request more material.

**Q: Cost center not appearing in report**
A: Cost center field is optional. Must be explicitly filled during Material Out recording.

**Q: Lost track of where material went**
A: That's why work package & purpose are MANDATORY. Always ensure these are filled clearly.

**Q: Need to correct a transaction**
A: Material Out transactions are immutable (for audit). Create reverse transaction if needed.

---

## 📋 Summary

Material Out Tracking dengan mandatory work package dan purpose adalah fitur critical untuk:
✓ Accountability - Know exactly where material goes
✓ Cost Control - Allocate costs to correct work package/cost center
✓ Audit Trail - Complete traceability for audit & compliance
✓ Efficiency - Identify high-waste activities
✓ Compliance - Prevent unauthorized material usage

**Remember**: Every material leaving the inventory MUST be tracked with full distribution details!

---

**Version**: 2.0 (Enhanced)
**Last Updated**: 2024
**Status**: Production Ready ✅
