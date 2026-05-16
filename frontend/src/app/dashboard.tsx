'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { AlertCircle, TrendingUp, Package, ClipboardList, AlertTriangle } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { api } from '@/lib/api'
import Link from 'next/link'

export default function DashboardPage() {
  const { selectedProject } = useProjectStore()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalRequests: 0,
    pendingRequests: 0,
    closedRequests: 0,
    totalBudget: 0,
    remainingBudget: 0,
  })
  const [inventory, setInventory] = useState([])
  const [requests, setRequests] = useState([])

  useEffect(() => {
    if (selectedProject) {
      fetchDashboardData()
    }
  }, [selectedProject])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      
      // Fetch requests
      const requestsRes = await api.get(`/api/requests?projectId=${selectedProject.id}`)
      setRequests(requestsRes.data.data.slice(0, 5))

      // Fetch inventory
      const inventoryRes = await api.get(`/api/inventory/${selectedProject.id}`)
      setInventory(inventoryRes.data.data)

      // Calculate stats
      const allRequests = requestsRes.data.data
      const totalBudget = inventoryRes.data.data.reduce((sum, item) => 
        sum + (item.budget_plafon || 0), 0
      )
      const remainingBudget = inventoryRes.data.data.reduce((sum, item) => 
        sum + (item.remaining_qty * item.unit_price || 0), 0
      )

      setStats({
        totalRequests: allRequests.length,
        pendingRequests: allRequests.filter(r => r.status === 'PENDING').length,
        closedRequests: allRequests.filter(r => r.status === 'CLOSED').length,
        totalBudget,
        remainingBudget,
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!selectedProject) {
    return (
      <div className="p-8">
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="h-6 w-6 text-amber-600 mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-900">No Project Selected</h3>
                <p className="text-sm text-amber-700 mt-1">Please select a project from the sidebar to view dashboard</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{selectedProject.project_name}</h1>
        <p className="text-slate-600 mt-1">Project Code: {selectedProject.project_code}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{stats.totalRequests}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm border-l-4 border-l-yellow-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-yellow-700">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-900">{stats.pendingRequests}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm border-l-4 border-l-green-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-700">Closed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-900">{stats.closedRequests}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Total Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">Rp {(stats.totalBudget / 1000000).toFixed(1)}M</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-blue-700">Remaining</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-900">Rp {(stats.remainingBudget / 1000000).toFixed(1)}M</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inventory Status */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Inventory Status</CardTitle>
            <CardDescription>Current on-site stock levels</CardDescription>
          </CardHeader>
          <CardContent>
            {inventory.length > 0 ? (
              <div className="space-y-4">
                {inventory.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{item.material_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-48 bg-slate-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              item.stock_status === 'CRITICAL' ? 'bg-red-500' :
                              item.stock_status === 'LOW' ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${Math.min((item.current_qty / (item.min_stock * 3)) * 100, 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${
                          item.stock_status === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                          item.stock_status === 'LOW' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {item.stock_status}
                        </span>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-2xl font-bold text-slate-900">{item.current_qty}</p>
                      <p className="text-xs text-slate-600">{item.unit_of_measure}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No inventory data available</p>
            )}
          </CardContent>
        </Card>

        {/* Critical Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Critical Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {inventory.filter(i => i.stock_status === 'CRITICAL').length > 0 ? (
                inventory.filter(i => i.stock_status === 'CRITICAL').map((item) => (
                  <div key={item.id} className="p-3 bg-red-50 border-l-4 border-l-red-500 rounded">
                    <p className="text-sm font-semibold text-red-900">{item.material_name}</p>
                    <p className="text-xs text-red-700 mt-1">Stock: {item.current_qty} {item.unit_of_measure}</p>
                  </div>
                ))
              ) : (
                <p className="text-slate-500 text-sm text-center py-4">No critical alerts</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Requests */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Requests</CardTitle>
              <CardDescription>Latest 5 material requests</CardDescription>
            </div>
            <Link href={`/projects/${selectedProject.id}/requests`}>
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Request No</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Items</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{req.request_no}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        req.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                        req.status === 'VERIFIED' ? 'bg-blue-100 text-blue-800' :
                        req.status === 'PROCESSING' ? 'bg-purple-100 text-purple-800' :
                        req.status === 'CLOSED' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{req.item_count} items</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{new Date(req.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
