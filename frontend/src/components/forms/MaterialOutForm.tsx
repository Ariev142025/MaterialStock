'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { AlertCircle, CheckCircle, AlertTriangle, Package } from 'lucide-react'
import { api } from '@/lib/api'

// ========== VALIDATION SCHEMA WITH MANDATORY FIELDS ==========
const MaterialOutSchema = z.object({
  materialId: z.string().uuid('Invalid material'),
  quantity: z.number().int().positive('Quantity must be greater than 0'),
  workPackage: z.string()
    .min(1, 'Work package is mandatory - identify where material will be used')
    .min(5, 'Please provide a detailed work package name')
    .max(255, 'Work package name too long'),
  unit: z.string().optional(),
  costCenter: z.string().optional(),
  purpose: z.string()
    .min(1, 'Purpose is mandatory - explain what material will be used for')
    .min(10, 'Please provide detailed purpose')
    .max(500, 'Purpose description too long'),
  location: z.string().optional(),
  notes: z.string().optional().default(''),
})

type MaterialOutForm = z.infer<typeof MaterialOutSchema>

// ========== MATERIAL OUT FORM COMPONENT ==========
export default function MaterialOutForm({ projectId }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [materials, setMaterials] = useState([])
  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [currentStock, setCurrentStock] = useState(null)
  const [stockWarning, setStockWarning] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [submitSuccess, setSubmitSuccess] = useState(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
    setValue,
  } = useForm({
    resolver: zodResolver(MaterialOutSchema),
    defaultValues: {
      materialId: '',
      quantity: 0,
      workPackage: '',
      unit: '',
      costCenter: '',
      purpose: '',
      location: '',
      notes: '',
    },
  })

  const selectedMaterialId = watch('materialId')
  const selectedQuantity = watch('quantity')
  const selectedWorkPackage = watch('workPackage')
  const selectedPurpose = watch('purpose')

  // Fetch available materials
  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        const response = await api.get('/api/materials')
        setMaterials(response.data.data)
      } catch (error) {
        console.error('Error fetching materials:', error)
      }
    }
    fetchMaterials()
  }, [])

  // Fetch stock when material changes
  useEffect(() => {
    if (selectedMaterialId) {
      fetchStockLevel()
    }
  }, [selectedMaterialId])

  // Check stock warning when quantity changes
  useEffect(() => {
    if (currentStock && selectedQuantity > 0) {
      checkStockWarning()
    }
  }, [selectedQuantity])

  const fetchStockLevel = async () => {
    try {
      const response = await api.get(`/api/inventory/${projectId}`)
      const stock = response.data.data.find(item => item.material_id === selectedMaterialId)
      
      if (stock) {
        setCurrentStock(stock)
        const material = materials.find(m => m.id === selectedMaterialId)
        setSelectedMaterial({ ...material, ...stock })
      } else {
        setCurrentStock(null)
        setSelectedMaterial(null)
      }
    } catch (error) {
      console.error('Error fetching stock:', error)
    }
  }

  const checkStockWarning = () => {
    if (!currentStock) return

    const newStock = currentStock.current_qty - selectedQuantity
    const minStockLevel = currentStock.min_stock * 1.5

    if (newStock <= currentStock.min_stock) {
      setStockWarning({
        level: 'CRITICAL',
        message: 'Stock akan mencapai level KRITIS',
        remainingQty: newStock,
        minStock: currentStock.min_stock,
      })
    } else if (newStock <= minStockLevel) {
      setStockWarning({
        level: 'LOW',
        message: 'Stock akan mencapai level RENDAH',
        remainingQty: newStock,
        minStock: currentStock.min_stock,
      })
    } else {
      setStockWarning(null)
    }
  }

  const onSubmit = async (data) => {
    try {
      setLoading(true)
      setSubmitError(null)
      setSubmitSuccess(null)

      // Validate mandatory fields once more
      if (!data.workPackage.trim()) {
        throw new Error('Work package wajib diisi - tentukan paket pekerjaan mana yang akan menerima material')
      }
      
      if (!data.purpose.trim()) {
        throw new Error('Purpose wajib diisi - jelaskan tujuan penggunaan material')
      }

      // Submit to API
      const response = await api.post(`/api/inventory/${projectId}/out`, {
        materialId: data.materialId,
        quantity: data.quantity,
        workPackage: data.workPackage.trim(),
        unit: data.unit?.trim() || null,
        costCenter: data.costCenter?.trim() || null,
        purpose: data.purpose.trim(),
        location: data.location?.trim() || null,
        notes: data.notes?.trim() || null,
      })

      if (response.data.success) {
        setSubmitSuccess({
          message: 'Material out berhasil dicatat',
          data: response.data.data,
        })

        // Reset form
        reset()
        setCurrentStock(null)
        setSelectedMaterial(null)
        setStockWarning(null)

        // Redirect after 2 seconds
        setTimeout(() => {
          router.push(`/projects/${projectId}/inventory`)
        }, 2000)
      }
    } catch (error) {
      setSubmitError({
        message: error.response?.data?.error || error.message,
        details: error.response?.data?.details,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Record Material Out</h1>
        <p className="text-slate-600 mt-1">Pencatatan pengambilan material dari stok dengan detail distribusi</p>
      </div>

      {/* Mandatory Requirements Alert */}
      <Card className="border-l-4 border-l-blue-500 bg-blue-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-blue-900">
            <AlertCircle className="h-4 w-4" />
            Persyaratan Wajib
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 space-y-2">
          <p>✓ Setiap pengambilan material <strong>WAJIB</strong> menyertakan:</p>
          <ul className="ml-4 space-y-1">
            <li>• <strong>Work Package</strong> - Paket pekerjaan/unit mana yang menerima material (contoh: "Basement Foundation - Unit A")</li>
            <li>• <strong>Purpose</strong> - Tujuan penggunaan material (contoh: "Concrete pouring untuk pondasi")</li>
            <li>• <strong>Quantity</strong> - Jumlah material yang diambil (validasi otomatis vs stok tersedia)</li>
          </ul>
        </CardContent>
      </Card>

      {/* Success Message */}
      {submitSuccess && (
        <Card className="border-l-4 border-l-green-500 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-green-900">
              <CheckCircle className="h-4 w-4" />
              Material Out Dicatat
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-green-800">
            <p>{submitSuccess.message}</p>
            {submitSuccess.data && (
              <div className="mt-3 p-3 bg-white rounded border border-green-200">
                <p className="font-semibold">{submitSuccess.data.material.name}</p>
                <p className="text-xs mt-1">
                  Qty: {submitSuccess.data.stock.quantityOut} {submitSuccess.data.material.unit}
                </p>
                <p className="text-xs mt-1">
                  Paket: {submitSuccess.data.distribution.workPackage}
                </p>
                <p className="text-xs mt-1">
                  Sisa Stok: {submitSuccess.data.stock.remainingStock} {submitSuccess.data.material.unit}
                </p>
              </div>
            )}
            <p className="text-xs mt-3">Redirecting...</p>
          </CardContent>
        </Card>
      )}

      {/* Error Message */}
      {submitError && (
        <Card className="border-l-4 border-l-red-500 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-red-900">
              <AlertTriangle className="h-4 w-4" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-red-800">
            <p className="font-semibold">{submitError.message}</p>
            {submitError.details && (
              <p className="text-xs mt-2 text-red-700">{submitError.details}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Material Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Material Selection</CardTitle>
            <CardDescription>Pilih material dan jumlah yang akan diambil</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Material Dropdown */}
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">
                Material <span className="text-red-500">*</span>
              </label>
              <select
                {...register('materialId')}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pilih material...</option>
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.material_name} ({material.unit_of_measure})
                  </option>
                ))}
              </select>
              {errors.materialId && (
                <p className="text-sm text-red-600 mt-1">{errors.materialId.message}</p>
              )}
            </div>

            {/* Stock Level Display */}
            {selectedMaterial && (
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-600">Current Stock</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {selectedMaterial.current_qty}
                    </p>
                    <p className="text-xs text-slate-600">{selectedMaterial.unit_of_measure}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Min Stock Level</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {selectedMaterial.min_stock}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Status</p>
                    <div className={`mt-1 px-2 py-1 rounded text-xs font-semibold ${
                      selectedMaterial.stock_status === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                      selectedMaterial.stock_status === 'LOW' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {selectedMaterial.stock_status}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quantity Input */}
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">
                Quantity <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                {...register('quantity', { valueAsNumber: true })}
                placeholder="Masukkan jumlah material"
                min="1"
                max={selectedMaterial?.current_qty || 999999}
              />
              {errors.quantity && (
                <p className="text-sm text-red-600 mt-1">{errors.quantity.message}</p>
              )}
              {selectedQuantity > 0 && currentStock && selectedQuantity <= currentStock.current_qty && (
                <p className="text-xs text-green-600 mt-1">
                  ✓ Stok tersedia. Sisa setelah pengambilan: {currentStock.current_qty - selectedQuantity} {selectedMaterial?.unit_of_measure}
                </p>
              )}
              {selectedQuantity > currentStock?.current_qty && (
                <p className="text-xs text-red-600 mt-1">
                  ✗ Stok tidak cukup. Maksimal: {currentStock?.current_qty} {selectedMaterial?.unit_of_measure}
                </p>
              )}
            </div>

            {/* Stock Warning */}
            {stockWarning && (
              <div className={`p-3 rounded-lg border ${
                stockWarning.level === 'CRITICAL'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-yellow-50 border-yellow-200 text-yellow-800'
              }`}>
                <p className="text-sm font-semibold">⚠️ {stockWarning.message}</p>
                <p className="text-xs mt-1">
                  Stok akan menjadi {stockWarning.remainingQty} {selectedMaterial?.unit_of_measure}
                  (Minimum: {stockWarning.minStock})
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Distribution Details (MANDATORY) */}
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-600" />
              Distribution Details <span className="text-red-500 text-sm">(WAJIB)</span>
            </CardTitle>
            <CardDescription>
              Setiap pengambilan material HARUS mencantumkan tujuan penggunaan dan paket pekerjaan yang menerimanya
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Work Package - MANDATORY */}
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">
                Work Package / Paket Pekerjaan <span className="text-red-500">*</span>
              </label>
              <Input
                {...register('workPackage')}
                placeholder="Contoh: Basement Foundation - Unit A, Concrete Slab Floor 3, dll"
                className={errors.workPackage ? 'border-red-500' : ''}
              />
              {errors.workPackage && (
                <p className="text-sm text-red-600 mt-1">⚠️ {errors.workPackage.message}</p>
              )}
              {selectedWorkPackage && !errors.workPackage && (
                <p className="text-xs text-green-600 mt-1">✓ Work package recorded</p>
              )}
            </div>

            {/* Purpose - MANDATORY */}
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">
                Purpose / Tujuan Penggunaan <span className="text-red-500">*</span>
              </label>
              <textarea
                {...register('purpose')}
                placeholder="Contoh: Concrete pouring untuk pondasi utama sesuai drawing REV-2"
                rows="3"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.purpose ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              <p className="text-xs text-slate-600 mt-1">Min 10 karakter - jelaskan secara detail tujuan penggunaan</p>
              {errors.purpose && (
                <p className="text-sm text-red-600 mt-1">⚠️ {errors.purpose.message}</p>
              )}
              {selectedPurpose && selectedPurpose.length >= 10 && !errors.purpose && (
                <p className="text-xs text-green-600 mt-1">✓ Purpose recorded</p>
              )}
            </div>

            {/* Unit (Optional) */}
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">
                Unit / Building Designation
              </label>
              <Input
                {...register('unit')}
                placeholder="Contoh: Unit 01, Blok A, Lantai 3, dll (Optional)"
              />
            </div>

            {/* Cost Center (Optional) */}
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">
                Cost Center Code
              </label>
              <Input
                {...register('costCenter')}
                placeholder="Contoh: CC-01, CIVIL, MEP, dll (Optional)"
              />
              <p className="text-xs text-slate-600 mt-1">Untuk tracking biaya per departemen</p>
            </div>

            {/* Location (Optional) */}
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">
                Physical Location at Site
              </label>
              <Input
                {...register('location')}
                placeholder="Contoh: Site A - North Area, Workshop Storage, dll (Optional)"
              />
            </div>

            {/* Additional Notes (Optional) */}
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">
                Additional Notes / Catatan Tambahan
              </label>
              <textarea
                {...register('notes')}
                placeholder="Contoh: Kondisi material baik, sudah dihitung scrap, quality check passed, dll"
                rows="2"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {selectedMaterial && selectedWorkPackage && selectedPurpose && selectedQuantity > 0 && (
          <Card className="bg-slate-50 border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Material:</span>
                <span className="font-medium">{selectedMaterial.material_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Quantity:</span>
                <span className="font-medium">{selectedQuantity} {selectedMaterial.unit_of_measure}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Work Package:</span>
                <span className="font-medium">{selectedWorkPackage}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Purpose:</span>
                <span className="font-medium text-xs">{selectedPurpose.substring(0, 50)}...</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-300">
                <span className="text-slate-600">Stock After Out:</span>
                <span className={`font-bold ${
                  currentStock && currentStock.current_qty - selectedQuantity < currentStock.min_stock
                    ? 'text-red-600'
                    : 'text-green-600'
                }`}>
                  {currentStock ? currentStock.current_qty - selectedQuantity : 0} {selectedMaterial.unit_of_measure}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Buttons */}
        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={isSubmitting || !selectedWorkPackage || !selectedPurpose}
            className="flex-1"
          >
            {isSubmitting ? 'Recording...' : 'Record Material Out'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset()
              setCurrentStock(null)
              setSelectedMaterial(null)
              setStockWarning(null)
            }}
          >
            Clear Form
          </Button>
        </div>

        {/* Form Validation Status */}
        <div className="text-xs text-slate-600 p-3 bg-slate-50 rounded border border-slate-200">
          <p className="font-semibold mb-2">Form Validation Status:</p>
          <ul className="space-y-1">
            <li className={selectedMaterial ? '✓ text-green-600' : '✗ text-red-600'}>
              Material selected: {selectedMaterial ? selectedMaterial.material_name : 'Pending'}
            </li>
            <li className={selectedQuantity > 0 && selectedQuantity <= (currentStock?.current_qty || 0) ? '✓ text-green-600' : '✗ text-red-600'}>
              Valid quantity: {selectedQuantity > 0 ? `${selectedQuantity}` : 'Pending'}
            </li>
            <li className={selectedWorkPackage ? '✓ text-green-600' : '✗ text-red-600'}>
              Work package: {selectedWorkPackage ? '✓ Filled' : 'Pending'}
            </li>
            <li className={selectedPurpose ? '✓ text-green-600' : '✗ text-red-600'}>
              Purpose: {selectedPurpose ? '✓ Filled' : 'Pending'}
            </li>
          </ul>
        </div>
      </form>
    </div>
  )
}
