# Codex Task: DachuanPro ERP Phase 1 — Frontend + API Implementation

## Context
You are extending the machinery-crm Next.js project with ERP Phase 1.
Working directory: E:\Claude\machinery-crm-source\machinery-crm-v108-release

The Prisma schema has been extended (760 lines, 13 new tables). Read it first:
```bash
cat prisma/schema.prisma | tail -300
```

Read the API specification:
```bash
cat _erp-inputs/api-spec-v1.md
```

## What to Build

### 1. API Routes (18 endpoints under src/app/api/erp/)

Create the following route files. Each must follow existing CRM patterns:
- Use `@/lib/db` for PrismaClient import
- Use `@/lib/auth` for session/auth
- Use `@/lib/permissions` for role checks
- Use `writeOperationLog` from existing patterns
- Return JSON responses

| File | Methods | Description |
|------|---------|-------------|
| `src/app/api/erp/materials/route.ts` | GET, POST | List/search materials, create new |
| `src/app/api/erp/materials/[id]/route.ts` | GET, PUT, DELETE | Get/update/soft-delete material |
| `src/app/api/erp/materials/import/route.ts` | POST | Excel batch import |
| `src/app/api/erp/material-categories/route.ts` | GET | Category tree |
| `src/app/api/erp/warehouses/route.ts` | GET, POST | List/create warehouses |
| `src/app/api/erp/warehouses/[id]/route.ts` | PUT, DELETE | Update/delete warehouse |
| `src/app/api/erp/inventory/route.ts` | GET | Inventory list with search/filter |
| `src/app/api/erp/stock-in/route.ts` | GET, POST | List/create stock-in |
| `src/app/api/erp/stock-in/[id]/route.ts` | GET | Stock-in detail |
| `src/app/api/erp/stock-out/route.ts` | GET, POST | List/create stock-out |
| `src/app/api/erp/stock-out/[id]/route.ts` | GET | Stock-out detail |
| `src/app/api/erp/stock-checks/route.ts` | GET, POST | List/create stock-check |
| `src/app/api/erp/stock-checks/[id]/route.ts` | GET, PUT | Detail / submit (DRAFT→DONE) |
| `src/app/api/erp/stock-movements/route.ts` | GET | Movement log |

Stock-in POST must use Prisma transaction: create StockIn + StockInItems → update Inventory (increment) → write StockMovement.
Stock-out POST must check quantity >= requested, then decrement.

### 2. Frontend Pages (6 pages under src/app/(app)/erp/)

Each page follows the existing CRM page patterns (dashboard/page.tsx or products/page.tsx are good references):
- Use Server Component for data fetching where possible
- Use `"use client"` for interactive parts (forms, buttons)
- Import from `@/components/ui/` (button, card, etc.)
- Same design system (Tailwind, lucide-react icons)

| Path | Page |
|------|------|
| `src/app/(app)/erp/materials/page.tsx` | Material list + search + create button |
| `src/app/(app)/erp/inventory/page.tsx` | Inventory overview with stock alerts |
| `src/app/(app)/erp/stock-in/page.tsx` | Stock-in form + history list |
| `src/app/(app)/erp/stock-out/page.tsx` | Stock-out form + history list |
| `src/app/(app)/erp/stock-check/page.tsx` | Stock-check workflow |
| `src/app/(app)/erp/warehouse/page.tsx` | Warehouse management |

### 3. Sidebar Update

Edit `src/components/layout/sidebar.tsx`:
- Add "ERP" section below "产品库"
- Sub-items: 物料管理, 库存总览, 入库单, 出库单, 盘点单, 仓库设置
- Use `Package` or `Boxes` icon from lucide-react
- Show only for SUPER_ADMIN and WAREHOUSE roles

### 4. Permission Middleware

Extend `src/lib/permissions.ts`:
- Add WAREHOUSE role support
- ERP module access: SUPER_ADMIN (full), WAREHOUSE (read/write inventory), others (read-only)

## Rules
1. Read existing code patterns first (e.g., `src/app/api/products/route.ts` for API style, `src/app/(app)/products/page.tsx` for page style)
2. All new files follow exactly the same conventions
3. Use TypeScript strictly
4. Run `npx tsc --noEmit` to verify no type errors
5. Commit each logical group separately

## Verification
After writing all files:
```bash
npx tsc --noEmit
git diff --stat
```

Start now. Read existing code → build API routes → build pages → update sidebar → verify.
