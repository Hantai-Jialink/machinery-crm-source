export type MapPoint = {
  lng: number;
  lat: number;
  address: string;
  name?: string;
};

export type ShipmentMapDestination = {
  id: string;
  address: string;
  location?: MapPoint;
  error?: string;
  // 兼容旧字段名（高德时期），天地图下不再使用，保留以免其它代码报错
  amapInfo?: string;
  amapInfocode?: string;
};

export type ShipmentMapGeocodeResponse = {
  ok: boolean;
  error?: string;
  failedAddress?: string;
  origin: MapPoint | null;
  destinations: ShipmentMapDestination[];
  resolvedCount?: number;
  skippedCount?: number;
  // 天地图浏览器端底图密钥（tk），由服务端在运行时读取 .env 后下发，
  // 这样更换密钥只需改 .env + 重启，无需重新构建。
  mapKey?: string;
};

export const FACTORY_ADDRESS = "山东省滕州市经济开发区兴滕东路";
export const FACTORY_NAME = "大川机床滕州工厂";
