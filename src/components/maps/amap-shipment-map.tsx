"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, MapPin } from "lucide-react";
import { loadAmap } from "@/lib/maps/amap";
import {
  FACTORY_ADDRESS,
  FACTORY_NAME,
  type ShipmentMapDestination,
  type ShipmentMapGeocodeResponse,
} from "@/lib/maps/types";

type AmapShipmentMapProps = {
  shipments: any[];
};

type RenderState = "idle" | "geocoding" | "loading-map" | "rendering" | "ready" | "error";

type FlowRoute = {
  path: number[][];
  marker: any;
  duration: number;
  offset: number;
};

function statusColor(status: string) {
  if (status === "SHIPPED") return "#67e8f9";
  if (status === "PARTIAL_SHIPPED") return "#facc15";
  return "#93c5fd";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function routeTitle(shipment: any, address: string) {
  return `
    <div style="min-width:220px;font-size:12px;line-height:1.65;color:#111827">
      <div style="font-weight:600;margin-bottom:4px">${escapeHtml(
        shipment.contract?.customer?.companyName || "客户"
      )}</div>
      <div>设备：${escapeHtml(
        shipment.equipmentName ||
          shipment.contract?.equipmentName ||
          shipment.contract?.equipmentModel ||
          "发货设备"
      )}</div>
      <div>合同：${escapeHtml(shipment.contract?.contractNo || "-")}</div>
      <div>地址：${escapeHtml(address)}</div>
    </div>
  `;
}

function formatMapError(error: string) {
  if (!error) return "";
  if (error.includes("INVALID_USER_KEY")) return "高德 Web端 JS API Key 无效，请检查 NEXT_PUBLIC_AMAP_JS_KEY。";
  if (error.includes("INVALID_SECURITY_CODE")) return "高德安全密钥无效，请检查 NEXT_PUBLIC_AMAP_SECURITY_CODE。";
  if (error.includes("USERKEY_PLAT_NOMATCH")) return "高德 Key 类型不匹配，请确认前端使用的是 Web端 JS API Key。";
  if (error.includes("INVALID_REFERER") || error.includes("INVALID_USER_DOMAIN")) {
    return "高德域名白名单不匹配，请在高德控制台加入当前访问域名/IP。";
  }
  return error;
}

function getLocationPair(point: { lng: number; lat: number }) {
  return [Number(point.lng), Number(point.lat)];
}

function createArcPath(start: number[], end: number[], bend = 0.22) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(distance) || distance < 0.01) return [start, end];

  const normalX = -dy / distance;
  const normalY = dx / distance;
  const arcHeight = Math.min(Math.max(distance * bend, 0.45), 5.2);
  const control = [
    (start[0] + end[0]) / 2 + normalX * arcHeight,
    (start[1] + end[1]) / 2 + normalY * arcHeight,
  ];

  return Array.from({ length: 48 }, (_, index) => {
    const t = index / 47;
    const oneMinusT = 1 - t;
    return [
      oneMinusT * oneMinusT * start[0] + 2 * oneMinusT * t * control[0] + t * t * end[0],
      oneMinusT * oneMinusT * start[1] + 2 * oneMinusT * t * control[1] + t * t * end[1],
    ];
  });
}

function positionOnPath(path: number[][], progress: number) {
  if (path.length <= 1) return path[0] || [0, 0];
  const scaled = progress * (path.length - 1);
  const index = Math.min(Math.floor(scaled), path.length - 2);
  const local = scaled - index;
  const current = path[index];
  const next = path[index + 1];
  return [
    current[0] + (next[0] - current[0]) * local,
    current[1] + (next[1] - current[1]) * local,
  ];
}

function factoryMarkerContent(label: string) {
  return `
    <div style="transform:translate(-50%,-50%);position:relative;width:34px;height:34px;">
      <div style="position:absolute;inset:-12px;border-radius:999px;background:rgba(103,232,249,.14);box-shadow:0 0 34px rgba(103,232,249,.95);animation:dachuan-map-pulse 1.8s ease-in-out infinite;"></div>
      <div style="position:absolute;inset:6px;border-radius:999px;background:#e0ffff;border:3px solid #22d3ee;box-shadow:0 0 18px #67e8f9;"></div>
      <div style="position:absolute;left:24px;top:-7px;padding:5px 9px;border-radius:999px;background:rgba(2,8,23,.76);border:1px solid rgba(103,232,249,.55);box-shadow:0 0 18px rgba(103,232,249,.35);font-size:12px;color:#ecfeff;white-space:nowrap;">${escapeHtml(label)}</div>
    </div>
  `;
}

function customerMarkerContent(label: string, color: string) {
  return `
    <div style="transform:translate(-50%,-50%);position:relative;">
      <div style="width:13px;height:13px;border-radius:999px;background:#fff;border:3px solid ${color};box-shadow:0 0 14px ${color},0 0 28px ${color};"></div>
      <div style="position:absolute;left:16px;top:-11px;padding:4px 8px;border-radius:999px;background:rgba(2,8,23,.72);border:1px solid rgba(148,163,184,.38);font-size:12px;color:#e0f2fe;white-space:nowrap;">${escapeHtml(label)}</div>
    </div>
  `;
}

function flowMarkerContent(color: string) {
  return `
    <div style="width:22px;height:22px;transform:translate(-50%,-50%);border-radius:999px;background:radial-gradient(circle,#ffffff 0 15%,${color} 24% 42%,rgba(255,255,255,0) 52%);box-shadow:0 0 10px ${color},0 0 24px ${color},0 0 42px ${color};pointer-events:none;"></div>
  `;
}

export function AmapShipmentMap({ shipments }: AmapShipmentMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const renderTokenRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  const [mapError, setMapError] = useState("");
  const [geocodeData, setGeocodeData] = useState<ShipmentMapGeocodeResponse | null>(null);
  const [renderState, setRenderState] = useState<RenderState>("idle");

  const geocodePayload = useMemo(
    () =>
      shipments.map((shipment, index) => ({
        id: String(shipment.id || index),
        address: shipment.receivingAddress || "",
      })),
    [shipments]
  );

  useEffect(() => {
    let active = true;

    async function resolveAddresses() {
      if (geocodePayload.length === 0) {
        setGeocodeData({ ok: true, origin: null, destinations: [], resolvedCount: 0, skippedCount: 0 });
        setMapError("");
        setRenderState("idle");
        return;
      }

      setRenderState("geocoding");
      setMapError("");

      try {
        const response = await fetch("/api/map/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinations: geocodePayload }),
        });

        let data: ShipmentMapGeocodeResponse | null = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (!response.ok) {
          throw new Error(data?.error || `发货地址解析接口异常（${response.status}）`);
        }

        if (!data) {
          throw new Error("发货地址解析接口未返回有效数据");
        }

        if (data.ok === false) {
          throw new Error(data.error || "发货地址解析失败");
        }

        if (!data.origin) {
          throw new Error("起点地址解析失败，请检查工厂地址或高德 Web服务 Key。");
        }

        if (active) setGeocodeData(data);
      } catch (error) {
        if (active) {
          setGeocodeData(null);
          setMapError(error instanceof Error ? error.message : "地图数据加载失败");
          setRenderState("error");
        }
      }
    }

    resolveAddresses();
    return () => {
      active = false;
    };
  }, [geocodePayload]);

  useEffect(() => {
    let active = true;
    const token = renderTokenRef.current + 1;
    renderTokenRef.current = token;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    async function renderMap() {
      if (!mapRef.current || !geocodeData?.origin) return;

      const validDestinations = geocodeData.destinations.filter((destination: ShipmentMapDestination) => Boolean(destination.location));
      if (validDestinations.length === 0) {
        setMapError("当前发货记录没有可显示的有效收货坐标，请检查收货地址是否完整。");
        setRenderState("error");
        return;
      }

      try {
        setMapError("");
        setRenderState("loading-map");

        const container = mapRef.current;
        container.style.width = "100%";
        container.style.height = "100%";
        container.innerHTML = "";

        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const AMap = await loadAmap();
        if (!active || !mapRef.current || token !== renderTokenRef.current) return;

        setRenderState("rendering");

        if (mapInstance.current) {
          mapInstance.current.destroy();
          mapInstance.current = null;
        }

        const origin = geocodeData.origin;
        const originPosition = getLocationPair(origin);
        const map = new AMap.Map(mapRef.current, {
          zoom: 5,
          center: originPosition,
          resizeEnable: true,
          viewMode: "2D",
          mapStyle: "amap://styles/darkblue",
          showLabel: true,
          features: ["bg", "road", "point"],
          layers: [new AMap.TileLayer()],
        });

        mapInstance.current = map;

        const overlays: any[] = [];
        const flowRoutes: FlowRoute[] = [];
        const infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -30) });

        try {
          map.addControl(new AMap.Scale());
          map.addControl(new AMap.ToolBar({ position: "RB" }));
        } catch (controlError) {
          console.warn("[Dachuan CRM AMap] add control failed", controlError);
        }

        const factoryMarker = new AMap.Marker({
          position: originPosition,
          title: FACTORY_NAME,
          content: factoryMarkerContent(FACTORY_NAME),
          zIndex: 160,
        });
        factoryMarker.on("click", () => {
          infoWindow.setContent(`<div style="font-size:12px;line-height:1.6"><b>${escapeHtml(FACTORY_NAME)}</b><br/>${escapeHtml(FACTORY_ADDRESS)}</div>`);
          infoWindow.open(map, originPosition);
        });
        map.add(factoryMarker);
        overlays.push(factoryMarker);

        geocodeData.destinations.forEach((destination: ShipmentMapDestination, destinationIndex: number) => {
          if (!destination.location) return;

          const shipmentIndex = shipments.findIndex((item) => String(item.id) === String(destination.id));
          const shipment = shipments[shipmentIndex >= 0 ? shipmentIndex : destinationIndex];
          if (!shipment) return;

          const position = getLocationPair(destination.location);
          const color = statusColor(shipment.shipmentStatus);
          const customerName = shipment.contract?.customer?.companyName || destination.address || "客户";
          const arcPath = createArcPath(originPosition, position, destinationIndex % 2 === 0 ? 0.24 : -0.2);

          const baseLine = new AMap.Polyline({
            path: arcPath,
            strokeColor: "#7dd3fc",
            strokeWeight: 2,
            strokeOpacity: 0.2,
            strokeStyle: "solid",
            lineJoin: "round",
            zIndex: 70,
          });

          const glowLine = new AMap.Polyline({
            path: arcPath,
            strokeColor: color,
            strokeWeight: 5,
            strokeOpacity: 0.18,
            strokeStyle: "solid",
            lineJoin: "round",
            zIndex: 80,
          });

          const brightLine = new AMap.Polyline({
            path: arcPath,
            strokeColor: color,
            strokeWeight: 2,
            strokeOpacity: 0.92,
            strokeStyle: "solid",
            lineJoin: "round",
            zIndex: 95,
          });

          const customerMarker = new AMap.Marker({
            position,
            title: customerName,
            content: customerMarkerContent(customerName, color),
            zIndex: 150,
          });
          customerMarker.on("click", () => {
            infoWindow.setContent(routeTitle(shipment, destination.address));
            infoWindow.open(map, position);
          });

          const flowMarker = new AMap.Marker({
            position: originPosition,
            content: flowMarkerContent(color),
            zIndex: 210,
            clickable: false,
          });

          map.add([baseLine, glowLine, brightLine, customerMarker, flowMarker]);
          overlays.push(baseLine, glowLine, brightLine, customerMarker, flowMarker);
          flowRoutes.push({
            path: arcPath,
            marker: flowMarker,
            duration: 3200 + destinationIndex * 360,
            offset: destinationIndex * 680,
          });
        });

        const animateFlow = (time: number) => {
          if (!active || token !== renderTokenRef.current) return;

          flowRoutes.forEach((route) => {
            const progress = ((time + route.offset) % route.duration) / route.duration;
            route.marker.setPosition(positionOnPath(route.path, progress));
          });

          animationFrameRef.current = requestAnimationFrame(animateFlow);
        };

        if (flowRoutes.length > 0) {
          animationFrameRef.current = requestAnimationFrame(animateFlow);
        }

        const fitMap = () => {
          if (!active || token !== renderTokenRef.current) return;
          try {
            map.resize();
            map.setFitView(overlays, false, [72, 72, 72, 72]);
          } catch (fitError) {
            console.warn("[Dachuan CRM AMap] fit view failed", fitError);
          }
        };

        map.on("complete", () => {
          fitMap();
          setRenderState("ready");
        });

        window.setTimeout(fitMap, 250);
        window.setTimeout(() => {
          fitMap();
          if (active && token === renderTokenRef.current) setRenderState("ready");
        }, 1000);
      } catch (error) {
        if (active) {
          console.error("[Dachuan CRM AMap] render failed", error);
          setMapError(error instanceof Error ? error.message : "高德地图加载失败");
          setRenderState("error");
        }
      }
    }

    renderMap();

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (mapInstance.current) {
        mapInstance.current.destroy();
        mapInstance.current = null;
      }
    };
  }, [geocodeData, shipments]);

  const resolvedCount =
    geocodeData?.destinations.filter((destination: ShipmentMapDestination) => Boolean(destination.location)).length || 0;
  const skippedCount = geocodeData?.skippedCount ?? Math.max((geocodeData?.destinations.length || 0) - resolvedCount, 0);
  const uniqueRegions = new Set(shipments.map((shipment) => shipment.contract?.customer?.region).filter(Boolean)).size;
  const displayError = formatMapError(mapError);
  const isBusy = renderState === "geocoding" || renderState === "loading-map" || renderState === "rendering";

  return (
    <div className="relative overflow-hidden rounded-xl border border-cyan-300/20 bg-slate-950 p-4 shadow-[0_18px_70px_rgba(8,47,73,.22)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,.22),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(59,130,246,.18),transparent_26%),linear-gradient(135deg,rgba(15,23,42,.4),rgba(8,47,73,.2))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />

      <div className="relative z-10 mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,.22)]">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-cyan-50">全国发货路径图</h2>
              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[11px] font-medium text-cyan-100">
                航线模式
              </span>
            </div>
            <p className="mt-1 text-xs text-cyan-100/60">
              起点：{FACTORY_ADDRESS} · 目的地根据客户收货地址解析
            </p>
            {skippedCount > 0 && !displayError && (
              <p className="mt-1 text-xs text-amber-200">{skippedCount} 条发货记录因地址不完整或解析失败已跳过。</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
          <div className="rounded-lg border border-cyan-300/20 bg-slate-900/70 px-4 py-2 text-cyan-50">
            <p className="text-[11px] text-cyan-100/55">已解析路径</p>
            <p className="text-xl font-semibold">{resolvedCount}</p>
          </div>
          <div className="rounded-lg border border-cyan-300/20 bg-slate-900/70 px-4 py-2 text-cyan-50">
            <p className="text-[11px] text-cyan-100/55">发货记录</p>
            <p className="text-xl font-semibold">{shipments.length}</p>
          </div>
          <div className="rounded-lg border border-cyan-300/20 bg-slate-900/70 px-4 py-2 text-cyan-50">
            <p className="text-[11px] text-cyan-100/55">区域</p>
            <p className="text-xl font-semibold">{uniqueRegions || "-"}</p>
          </div>
        </div>
      </div>

      <div className="relative z-10 h-[520px] min-h-[520px] rounded-lg border border-cyan-300/20 overflow-hidden bg-slate-950 shadow-inner">
        <style>{`
          @keyframes dachuan-map-pulse {
            0%, 100% { transform: scale(.72); opacity: .46; }
            50% { transform: scale(1.18); opacity: .92; }
          }
          .dachuan-space-map .amap-layer img,
          .dachuan-space-map .amap-tile,
          .dachuan-space-map canvas {
            filter: invert(1) hue-rotate(165deg) saturate(1.55) brightness(.58) contrast(1.18);
          }
          .dachuan-space-map .amap-logo,
          .dachuan-space-map .amap-copyright {
            filter: none;
            opacity: .72;
          }
          .dachuan-space-map .amap-controls {
            filter: invert(1) hue-rotate(165deg) saturate(1.2) brightness(.82);
          }
          .dachuan-space-map::after {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            background:
              radial-gradient(circle at 58% 46%, rgba(34, 211, 238, .18), transparent 18%),
              linear-gradient(90deg, rgba(2, 6, 23, .38), transparent 28%, transparent 72%, rgba(2, 6, 23, .42)),
              linear-gradient(180deg, rgba(2, 6, 23, .24), transparent 42%, rgba(2, 6, 23, .34));
            mix-blend-mode: screen;
            z-index: 2;
          }
        `}</style>
        <div
          ref={mapRef}
          className="dachuan-space-map absolute inset-0 w-full h-full min-h-[520px]"
          style={{ width: "100%", height: "100%", minHeight: 520 }}
        />

        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-lg border border-cyan-300/25 bg-slate-950/72 px-4 py-3 text-cyan-50 shadow-[0_0_32px_rgba(34,211,238,.18)] backdrop-blur">
          <p className="text-xs text-cyan-100/70">大川机床发货网络</p>
          <p className="text-sm font-semibold text-cyan-50">滕州工厂实时路径</p>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 bg-gradient-to-t from-slate-950/78 to-transparent p-4">
          <div className="rounded-full border border-cyan-300/20 bg-slate-950/70 px-4 py-2 text-xs text-cyan-100/75 backdrop-blur">
            流光航线按当前筛选范围内发货记录生成
          </div>
          <div className="hidden rounded-full border border-cyan-300/20 bg-slate-950/70 px-4 py-2 text-xs text-cyan-100/75 backdrop-blur sm:block">
            {resolvedCount} / {shipments.length} 条路径
          </div>
        </div>

        {(isBusy || displayError || shipments.length === 0) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 px-6 text-center text-sm text-cyan-50 backdrop-blur-sm">
            {isBusy ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-cyan-200" />
                <span>{renderState === "geocoding" ? "正在解析发货地址..." : "正在加载航线地图..."}</span>
              </div>
            ) : displayError ? (
              <div className="max-w-xl">
                <div className="flex justify-center mb-3 text-amber-300">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <p className="font-medium text-cyan-50">地图加载失败</p>
                <p className="mt-2 leading-6 text-cyan-50/80">{displayError}</p>
                <p className="mt-2 text-xs text-cyan-100/50">
                  此错误只影响地图显示，不影响客户、合同、发货等其他业务功能。
                </p>
              </div>
            ) : (
              "当前日期筛选范围内暂无发货路径"
            )}
          </div>
        )}
      </div>
    </div>
  );
}
