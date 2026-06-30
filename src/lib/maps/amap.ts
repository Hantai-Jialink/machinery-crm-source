declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
    __dachuanAmapLoader?: Promise<any>;
    __dachuanAmapReady?: (AMap: any) => void;
    __dachuanAmapError?: (error: unknown) => void;
  }
}

export function getAmapClientConfig() {
  return {
    key: process.env.NEXT_PUBLIC_AMAP_JS_KEY || "",
    securityCode: process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE || "",
  };
}

function waitForAmapReady(timeoutMs = 15000) {
  return new Promise<any>((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      if (window.AMap?.Map) {
        resolve(window.AMap);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error("高德地图脚本已加载，但 AMap.Map 未就绪，请检查 JS API Key、白名单或浏览器网络。"));
        return;
      }

      window.setTimeout(check, 80);
    };

    check();
  });
}

export function loadAmap() {
  const { key, securityCode } = getAmapClientConfig();

  if (!key) {
    return Promise.reject(new Error("高德 Web端 JS API Key 未配置"));
  }

  if (!securityCode) {
    return Promise.reject(new Error("高德 Web端 JS 安全密钥未配置"));
  }

  if (typeof window === "undefined") {
    return Promise.reject(new Error("高德地图只能在浏览器中加载"));
  }

  window._AMapSecurityConfig = {
    securityJsCode: securityCode,
  };

  if (window.AMap?.Map) {
    return Promise.resolve(window.AMap);
  }

  if (window.__dachuanAmapLoader) {
    return window.__dachuanAmapLoader;
  }

  window.__dachuanAmapLoader = new Promise((resolve, reject) => {
    const existedScript = document.querySelector<HTMLScriptElement>("script[data-dachuan-amap='true']");

    const finish = () => {
      waitForAmapReady()
        .then((AMap) => {
          console.info("[Dachuan CRM AMap] JS API ready");
          resolve(AMap);
        })
        .catch((error) => {
          window.__dachuanAmapLoader = undefined;
          reject(error);
        });
    };

    if (existedScript) {
      existedScript.addEventListener("load", finish, { once: true });
      existedScript.addEventListener(
        "error",
        () => {
          window.__dachuanAmapLoader = undefined;
          reject(new Error("高德地图脚本加载失败，请检查 Web端 JS API Key、域名白名单和网络连接"));
        },
        { once: true }
      );
      finish();
      return;
    }

    window.__dachuanAmapReady = () => finish();
    window.__dachuanAmapError = (error) => {
      window.__dachuanAmapLoader = undefined;
      reject(error instanceof Error ? error : new Error("高德地图脚本加载失败"));
    };

    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(
      key
    )}&plugin=AMap.Scale,AMap.ToolBar&callback=__dachuanAmapReady`;
    script.async = true;
    script.dataset.dachuanAmap = "true";

    script.onerror = () => {
      window.__dachuanAmapLoader = undefined;
      reject(new Error("高德地图脚本加载失败，请检查 Web端 JS API Key、域名白名单和网络连接"));
    };

    document.head.appendChild(script);
  });

  return window.__dachuanAmapLoader;
}
