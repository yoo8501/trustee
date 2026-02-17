import type { IncomingMessage } from "http";
import type { ClientRequest } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";

import { config } from "./config";

function fixRequestBody(proxyReq: ClientRequest, req: IncomingMessage) {
  const body = (req as IncomingMessage & { body?: unknown }).body;
  if (body && Object.keys(body as object).length > 0) {
    const bodyData = JSON.stringify(body);
    proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }
}

export const trusteeProxy = createProxyMiddleware({
  target: config.trusteeServiceUrl,
  changeOrigin: true,
  pathFilter: ["/api/trustees", "/api/contracts"],
  on: { proxyReq: fixRequestBody },
});

export const inspectionProxy = createProxyMiddleware({
  target: config.inspectionServiceUrl,
  changeOrigin: true,
  pathFilter: ["/api/inspections", "/api/inspection-items"],
  on: { proxyReq: fixRequestBody },
});
