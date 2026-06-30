import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/permissions";
import {
  FACTORY_ADDRESS,
  FACTORY_NAME,
  type MapPoint,
  type ShipmentMapDestination,
  type ShipmentMapGeocodeResponse,
} from "@/lib/maps/types";

type GeocodeInput = {
  id: string;
  address: string;
};

type GeocodeResult = {
  point: MapPoint | null;
  error?: string;
  amapInfo?: string;
  amapInfocode?: string;
};

function json(payload: ShipmentMapGeocodeResponse, init?: ResponseInit) {
  return NextResponse.json(payload, init);
}

function normalizeAddress(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function geocode(address: string): Promise<GeocodeResult> {
  const key = process.env.AMAP_WEB_SERVICE_KEY?.trim();
  const normalizedAddress = normalizeAddress(address);

  if (!key) {
    return {
      point: null,
      error: "AMAP_WEB_SERVICE_KEY 未配置，请先在 .env 中配置高德 Web服务 Key",
    };
  }

  if (!normalizedAddress) {
    return {
      point: null,
      error: "地址为空，无法解析",
    };
  }

  const params = new URLSearchParams({
    key,
    address: normalizedAddress,
    output: "json",
  });

  try {
    const response = await fetch(`https://restapi.amap.com/v3/geocode/geo?${params.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        point: null,
        error: `高德地理编码接口请求失败（HTTP ${response.status}）`,
      };
    }

    const data = await response.json();
    const first = data?.geocodes?.[0];
    const location = first?.location;

    if (data?.status !== "1") {
      return {
        point: null,
        error: data?.info ? `高德地理编码失败：${data.info}` : "高德地理编码失败",
        amapInfo: data?.info,
        amapInfocode: data?.infocode,
      };
    }

    if (!location) {
      return {
        point: null,
        error: "高德未返回有效坐标",
        amapInfo: data?.info,
        amapInfocode: data?.infocode,
      };
    }

    const [lng, lat] = String(location).split(",").map(Number);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return {
        point: null,
        error: "高德返回的坐标格式无效",
        amapInfo: data?.info,
        amapInfocode: data?.infocode,
      };
    }

    return {
      point: {
        lng,
        lat,
        address: normalizedAddress,
        name: first?.formatted_address || normalizedAddress,
      },
    };
  } catch (error) {
    return {
      point: null,
      error: error instanceof Error ? error.message : "地理编码请求异常",
    };
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "请求体不是有效 JSON",
        origin: null,
        destinations: [],
      },
      { status: 400 }
    );
  }

  const destinations = Array.isArray((body as any)?.destinations)
    ? ((body as any).destinations as GeocodeInput[])
    : [];

  const originResult = await geocode(FACTORY_ADDRESS);
  const origin = originResult.point;
  if (origin) {
    origin.name = FACTORY_NAME;
  }

  if (!origin) {
    return json({
      ok: false,
      error: originResult.error || "起点地址解析失败",
      failedAddress: FACTORY_ADDRESS,
      origin: null,
      destinations: [],
    });
  }

  const resolved: ShipmentMapDestination[] = await Promise.all(
    destinations.slice(0, 30).map(async (item) => {
      const address = normalizeAddress(item?.address);
      const id = String(item?.id || "");

      if (!id || !address) {
        return {
          id,
          address,
          error: "缺少收货地址",
        };
      }

      const result = await geocode(address);
      return result.point
        ? { id, address, location: result.point }
        : {
            id,
            address,
            error: result.error || "地址解析失败",
            amapInfo: result.amapInfo,
            amapInfocode: result.amapInfocode,
          };
    })
  );

  const resolvedCount = resolved.filter((destination) => Boolean(destination.location)).length;
  const skippedCount = resolved.length - resolvedCount;

  return json({
    ok: true,
    origin,
    destinations: resolved,
    resolvedCount,
    skippedCount,
  });
}
