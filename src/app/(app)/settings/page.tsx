"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ROLE_LABELS } from "@/lib/constants";
import { APP_NAME, APP_VERSION, CURRENT_RELEASE, CHANGELOG } from "@/lib/changelog";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [showHistory, setShowHistory] = useState(false);
  const history = CHANGELOG.slice(1);

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
        <p className="text-sm font-medium text-gray-900">{APP_NAME} {APP_VERSION}</p>
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-gray-500">当前版本更新内容（{CURRENT_RELEASE.date}）</p>
          <ol className="space-y-1 text-sm text-gray-600 list-decimal list-inside">
            {CURRENT_RELEASE.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ol>
        </div>

        {history.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setShowHistory((value) => !value)}
              className="text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              {showHistory ? "收起历史更新记录" : `查看历史更新记录（${history.length} 个版本）`}
            </button>
            {showHistory && (
              <div className="mt-3 space-y-4">
                {history.map((release) => (
                  <div key={release.version}>
                    <p className="text-sm font-medium text-gray-800">
                      {APP_NAME} {release.version}
                      <span className="text-xs font-normal text-gray-400"> · {release.date}</span>
                    </p>
                    <ol className="mt-1 space-y-1 text-sm text-gray-500 list-decimal list-inside">
                      {release.notes.map((note, index) => (
                        <li key={index}>{note}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
