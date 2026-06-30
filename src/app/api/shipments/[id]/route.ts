import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isSuperAdmin } from "@/lib/permissions";
import { writeOperationLog } from "@/lib/sales-items";

const SHIPMENT_STATUS = ["NOT_SHIPPED", "PARTIAL_SHIPPED", "SHIPPED"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "请求数据格式错误，请刷新页面后重试" }, { status: 400 });
    }

    if (body.contractId !== undefined) {
      return NextResponse.json({ error: "发货记录不允许修改关联合同" }, { status: 400 });
    }

    const { id } = await params;
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        contract: {
          include: { customer: { select: { region: true } } },
        },
      },
    });
    if (!shipment) return NextResponse.json({ error: "发货记录不存在" }, { status: 404 });
    if (!isSuperAdmin(user) && shipment.contract.customer.region !== user.region) {
      return NextResponse.json({ error: "无权限编辑该发货记录" }, { status: 403 });
    }

    const updateData: any = {};
    if (body.shipmentStatus !== undefined) {
      if (!SHIPMENT_STATUS.includes(body.shipmentStatus)) {
        return NextResponse.json({ error: "发货状态无效" }, { status: 400 });
      }
      if (!isSuperAdmin(user) && shipment.shipmentStatus !== "NOT_SHIPPED" && body.shipmentStatus === "NOT_SHIPPED") {
        return NextResponse.json({ error: "普通销售不能将部分发货或已发货记录回退为未发货" }, { status: 403 });
      }
      updateData.shipmentStatus = body.shipmentStatus;
    }

    if (body.shipmentDate !== undefined) {
      const shipmentDate = new Date(body.shipmentDate);
      if (Number.isNaN(shipmentDate.getTime())) {
        return NextResponse.json({ error: "发货日期格式错误" }, { status: 400 });
      }
      updateData.shipmentDate = shipmentDate;
    }
    for (const field of ["receivingAddress", "driverPhone", "equipmentName"] as const) {
      if (body[field] !== undefined) {
        const value = String(body[field]).trim();
        if (!value) return NextResponse.json({ error: "收货地址、司机电话和发货设备不能为空" }, { status: 400 });
        updateData[field] = value;
      }
    }
    if (body.quantity !== undefined) {
      const quantity = parseInt(String(body.quantity), 10);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json({ error: "发货数量必须大于 0" }, { status: 400 });
      }
      updateData.quantity = quantity;
    }
    if (body.deliveryNoteUrl !== undefined) updateData.deliveryNoteUrl = body.deliveryNoteUrl || null;
    if (body.shipmentPhotoUrl !== undefined) updateData.shipmentPhotoUrl = body.shipmentPhotoUrl || null;
    if (body.remark !== undefined) updateData.remark = body.remark || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "没有可保存的修改内容" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const after = await tx.shipment.update({
        where: { id },
        data: updateData,
      });
      await writeOperationLog(tx, {
        userId: user.id,
        action: "UPDATE_SHIPMENT",
        entityType: "Shipment",
        entityId: id,
        beforeData: shipment,
        afterData: after,
      });
      return after;
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("[shipments.id.PUT]", error);
    return NextResponse.json({ error: error.message || "修改发货记录失败" }, { status: 400 });
  }
}
