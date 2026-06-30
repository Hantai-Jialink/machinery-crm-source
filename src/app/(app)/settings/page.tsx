"use client";

import { useSession } from "next-auth/react";
import { ROLE_LABELS } from "@/lib/constants";

export default function SettingsPage() {
  const { data: session } = useSession();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">系统设置</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">当前账号信息</h2>
        <dl className="space-y-3">
          <div className="flex items-center gap-4">
            <dt className="text-sm text-gray-500 w-20">姓名</dt>
            <dd className="text-sm text-gray-900">{session?.user?.name}</dd>
          </div>
          <div className="flex items-center gap-4">
            <dt className="text-sm text-gray-500 w-20">账号</dt>
            <dd className="text-sm text-gray-900">{session?.user?.email}</dd>
          </div>
          <div className="flex items-center gap-4">
            <dt className="text-sm text-gray-500 w-20">角色</dt>
            <dd className="text-sm text-gray-900">{ROLE_LABELS[(session?.user as any)?.role] || "-"}</dd>
          </div>
          <div className="flex items-center gap-4">
            <dt className="text-sm text-gray-500 w-20">区域</dt>
            <dd className="text-sm text-gray-900">{(session?.user as any)?.region || "-"}</dd>
          </div>
        </dl>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">系统版本</h2>
        <p className="text-sm font-medium text-gray-900">DachuanPro v1.1.0</p>
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-gray-500">当前版本更新内容</p>
          <ol className="space-y-1 text-sm text-gray-600 list-decimal list-inside">
            <li>第二阶段完善合同与回款管理，支持回款记录修改与金额联动校验。</li>
            <li>增加合同锁定规则，已发货、已完成、已归档合同默认禁止普通用户修改。</li>
            <li>增加超级管理员审批机制，锁定合同需审批后方可修改。</li>
            <li>新增操作日志后台，记录回款、合同、审批等关键操作。</li>
            <li>优化一键转合同规则，避免重复生成合同和金额覆盖风险。</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
