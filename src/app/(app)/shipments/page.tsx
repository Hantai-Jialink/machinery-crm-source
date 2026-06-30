"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Edit2, FileText, Image, Plus, Search, Truck, X } from "lucide-react";
import { REGIONS } from "@/lib/constants";
import { toProtectedUploadUrl } from "@/lib/upload-urls";

const SHIPMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  NOT_SHIPPED: { label: "未发货", color: "bg-gray-100 text-gray-700" },
  PARTIAL_SHIPPED: { label: "部分发货", color: "bg-yellow-50 text-yellow-700" },
  SHIPPED: { label: "已发货", color: "bg-green-50 text-green-700" },
};

const defaultForm = {
  contractId: "",
  shipmentDate: new Date().toISOString().split("T")[0],
  receivingAddress: "",
  driverPhone: "",
  equipmentName: "",
  quantity: "1",
  shipmentStatus: "NOT_SHIPPED",
  deliveryNoteUrl: "",
  shipmentPhotoUrl: "",
  remark: "",
};

async function readJson(res: Response) {
  return res.json().catch(() => ({}));
}

function toDateInput(value: any) {
  if (!value) return "";
  return new Date(value).toISOString().split("T")[0];
}

function contractEquipmentLabel(contract: any) {
  const mainItems = contract?.items?.filter((item: any) => item.itemType === "MAIN") || [];
  if (mainItems.length) {
    return mainItems.map((item: any) => `${item.productNameSnapshot || ""} ${item.productModelSnapshot || ""}`.trim()).join("、");
  }
  return contract?.equipmentName || contract?.equipmentModel || "";
}

export default function ShipmentsPage() {
  const { data: session } = useSession();
  const [shipments, setShipments] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingShipment, setEditingShipment] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [region, setRegion] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [salesUserId, setSalesUserId] = useState("");
  const [createdById, setCreatedById] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const userRole = (session?.user as any)?.role;
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (region) params.set("region", region);
    if (customerId) params.set("customerId", customerId);
    if (salesUserId) params.set("salesUserId", salesUserId);
    if (createdById) params.set("createdById", createdById);
    if (dateStart) params.set("dateStart", dateStart);
    if (dateEnd) params.set("dateEnd", dateEnd);
    return params.toString();
  }, [search, status, region, customerId, salesUserId, createdById, dateStart, dateEnd]);

  const fetchShipments = () => {
    setLoading(true);
    setError("");
    fetch(`/api/shipments?${query}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || "发货记录加载失败");
        return Array.isArray(data) ? data : [];
      })
      .then(setShipments)
      .catch((err) => setError(err.message || "发货记录加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const contractId = new URLSearchParams(window.location.search).get("contractId") || "";
    if (contractId) {
      setShowForm(true);
      setForm((current) => ({ ...current, contractId }));
    }
    Promise.all([
      fetch("/api/contracts").then(readJson),
      fetch("/api/customers?pageSize=500").then(readJson),
      fetch("/api/users/active").then(readJson),
    ]).then(([contractData, customerData, userData]) => {
      const nextContracts = Array.isArray(contractData) ? contractData : [];
      setContracts(nextContracts);
      setCustomers(customerData.customers || []);
      setActiveUsers(Array.isArray(userData) ? userData : []);
      const contract = nextContracts.find((item) => item.id === contractId);
      if (contract) {
        setForm((current) => ({ ...current, contractId, equipmentName: contractEquipmentLabel(contract) || current.equipmentName }));
      }
    }).catch(() => setError("筛选选项加载失败"));
  }, []);

  useEffect(() => {
    fetchShipments();
  }, [query]);

  const clearMessages = () => {
    setError("");
    setNotice("");
  };

  const resetForm = () => {
    setEditingShipment(null);
    setShowForm(false);
    setForm(defaultForm);
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setRegion("");
    setCustomerId("");
    setSalesUserId("");
    setCreatedById("");
    setDateStart("");
    setDateEnd("");
  };

  const handleContractChange = (contractId: string) => {
    const contract = contracts.find((item) => item.id === contractId);
    setForm((current) => ({
      ...current,
      contractId,
      equipmentName: contractEquipmentLabel(contract) || current.equipmentName,
    }));
  };

  const startEdit = (shipment: any) => {
    clearMessages();
    setEditingShipment(shipment);
    setShowForm(true);
    setForm({
      contractId: shipment.contractId,
      shipmentDate: toDateInput(shipment.shipmentDate),
      receivingAddress: shipment.receivingAddress || "",
      driverPhone: shipment.driverPhone || "",
      equipmentName: shipment.equipmentName || "",
      quantity: String(shipment.quantity || 1),
      shipmentStatus: shipment.shipmentStatus || "NOT_SHIPPED",
      deliveryNoteUrl: shipment.deliveryNoteUrl || "",
      shipmentPhotoUrl: shipment.shipmentPhotoUrl || "",
      remark: shipment.remark || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const uploadFile = async (file: File, type: "docs" | "photos") => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    const res = await fetch("/api/upload/shipments", { method: "POST", body: formData });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "上传失败");
    return data.url as string;
  };

  const handleFileChange = async (file: File | undefined, type: "docs" | "photos") => {
    if (!file) return;
    clearMessages();
    setSaving(true);
    try {
      const url = await uploadFile(file, type);
      setForm((current) => type === "docs" ? { ...current, deliveryNoteUrl: url } : { ...current, shipmentPhotoUrl: url });
      setNotice(type === "docs" ? "发货单已上传，保存后生效" : "发货照片已上传，保存后生效");
    } catch (err: any) {
      setError(err.message || "上传失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.contractId || !form.shipmentDate || !form.receivingAddress || !form.driverPhone || !form.equipmentName || !form.quantity) {
      setError("合同、发货日期、收货地址、司机电话、发货设备和数量为必填");
      return;
    }
    clearMessages();
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (editingShipment) delete payload.contractId;
      const res = await fetch(editingShipment ? `/api/shipments/${editingShipment.id}` : "/api/shipments", {
        method: editingShipment ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(data.error || "保存发货记录失败");
        return;
      }
      const message = editingShipment ? "发货记录已修改，工作台地图将使用最新收货地址" : "发货记录已保存";
      resetForm();
      setNotice(message);
      fetchShipments();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">发货管理</h1>
        <button
          onClick={() => {
            clearMessages();
            if (showForm) resetForm();
            else setShowForm(true);
          }}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "收起" : "新增发货"}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">{editingShipment ? "修改发货记录" : "新增发货记录"}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">关联合同 *</label>
              <select value={form.contractId} disabled={!!editingShipment} onChange={(event) => handleContractChange(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50">
                <option value="">请选择合同</option>
                {contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.contractNo} - {contract.customer?.companyName}</option>)}
              </select>
              {editingShipment && <p className="text-xs text-gray-400 mt-1">修改发货记录时不允许更换合同</p>}
            </div>
            <FormInput label="发货日期 *" type="date" value={form.shipmentDate} onChange={(value) => setForm({ ...form, shipmentDate: value })} />
            <FormInput label="司机电话 *" value={form.driverPhone} onChange={(value) => setForm({ ...form, driverPhone: value })} />
            <FormInput label="发货设备 *" value={form.equipmentName} onChange={(value) => setForm({ ...form, equipmentName: value })} />
            <FormInput label="发货数量 *" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">发货状态 *</label>
              <select value={form.shipmentStatus} onChange={(event) => setForm({ ...form, shipmentStatus: event.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="NOT_SHIPPED">未发货</option>
                <option value="PARTIAL_SHIPPED">部分发货</option>
                <option value="SHIPPED">已发货</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">收货地址 *</label>
              <textarea value={form.receivingAddress} onChange={(event) => setForm({ ...form, receivingAddress: event.target.value })} rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
            </div>
            <FileUpload label="发货单" url={form.deliveryNoteUrl} icon="doc" onChange={(file) => handleFileChange(file, "docs")} />
            <FileUpload label="发货照片" url={form.shipmentPhotoUrl} icon="image" onChange={(file) => handleFileChange(file, "photos")} />
            <FormInput label="备注" value={form.remark} onChange={(value) => setForm({ ...form, remark: value })} />
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {saving ? "保存中..." : editingShipment ? "保存修改" : "保存发货记录"}
            </button>
            <button onClick={resetForm} className="px-4 py-2 bg-white text-gray-700 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">取消</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索合同编号、客户、联系人、设备、司机电话或地址"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部发货状态</option>
            <option value="NOT_SHIPPED">未发货</option>
            <option value="PARTIAL_SHIPPED">部分发货</option>
            <option value="SHIPPED">已发货</option>
          </select>
          {userRole === "SUPER_ADMIN" && (
            <select value={region} onChange={(event) => setRegion(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">全部区域</option>
              {REGIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          )}
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部客户</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
          </select>
          <select value={salesUserId} onChange={(event) => setSalesUserId(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部归属业务员</option>
            {activeUsers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={createdById} onChange={(event) => setCreatedById(event.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">全部创建人</option>
            {activeUsers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <DateInput label="发货开始" value={dateStart} onChange={setDateStart} />
          <DateInput label="发货结束" value={dateEnd} onChange={setDateEnd} />
        </div>
        <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-900">清空筛选</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[1120px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">合同</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">客户</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">区域</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">发货日期</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">设备</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">数量</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">司机电话</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">状态</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">附件</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={10} className="text-center py-8 text-sm text-gray-500">加载中...</td></tr>
            ) : shipments.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-8 text-sm text-gray-500">暂无发货记录</td></tr>
            ) : shipments.map((shipment) => (
              <tr key={shipment.id} className="hover:bg-gray-50">
                <td className="px-4 py-3"><Link href={`/contracts/${shipment.contract?.id}`} className="text-sm font-medium text-gray-900 hover:underline">{shipment.contract?.contractNo}</Link></td>
                <td className="px-4 py-3"><Link href={`/customers/${shipment.contract?.customer?.id}`} className="text-sm text-gray-600 hover:underline">{shipment.contract?.customer?.companyName}</Link></td>
                <td className="px-4 py-3 text-sm text-gray-600">{shipment.contract?.customer?.region}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{new Date(shipment.shipmentDate).toLocaleDateString("zh-CN")}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{shipment.equipmentName}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{shipment.quantity}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{shipment.driverPhone}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${SHIPMENT_STATUS_LABELS[shipment.shipmentStatus]?.color}`}>{SHIPMENT_STATUS_LABELS[shipment.shipmentStatus]?.label}</span></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {shipment.deliveryNoteUrl && <a href={toProtectedUploadUrl(shipment.deliveryNoteUrl)} target="_blank" className="text-xs text-blue-600 hover:underline">发货单</a>}
                    {shipment.shipmentPhotoUrl && <a href={toProtectedUploadUrl(shipment.shipmentPhotoUrl)} target="_blank" className="text-xs text-blue-600 hover:underline">照片</a>}
                    {!shipment.deliveryNoteUrl && !shipment.shipmentPhotoUrl && <span className="text-xs text-gray-400">无</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => startEdit(shipment)} disabled={saving} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50">
                    <Edit2 className="w-3.5 h-3.5" />修改
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FormInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm">
      <span className="shrink-0 text-xs text-gray-500">{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 text-sm focus:outline-none" />
    </label>
  );
}

function FileUpload({ label, url, icon, onChange }: { label: string; url: string; icon: "doc" | "image"; onChange: (file: File | undefined) => void }) {
  const Icon = icon === "doc" ? FileText : Image;
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}（非必填）</label>
      <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
        <Icon className="w-4 h-4" />
        {url ? "已上传，点击更换" : "选择文件"}
        <input type="file" className="hidden" accept={icon === "doc" ? ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" : ".jpg,.jpeg,.png,.webp"}
          onChange={(event) => onChange(event.target.files?.[0])} />
      </label>
      {url && <a href={toProtectedUploadUrl(url)} target="_blank" className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600 hover:underline"><Truck className="w-3 h-3" />查看已上传文件</a>}
    </div>
  );
}
