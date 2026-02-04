import { createProxyMiddleware } from "http-proxy-middleware";

import { config } from "./config";

export const trusteeProxy = createProxyMiddleware({
  target: config.trusteeServiceUrl,
  changeOrigin: true,
  pathRewrite: {
    "^/api/trustees": "/api/trustees",
    "^/api/contracts": "/api/contracts",
  },
});

export const inspectionProxy = createProxyMiddleware({
  target: config.inspectionServiceUrl,
  changeOrigin: true,
  pathRewrite: {
    "^/api/inspections": "/api/inspections",
    "^/api/inspection-items": "/api/inspection-items",
  },
});
