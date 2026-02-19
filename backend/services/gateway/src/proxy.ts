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
  pathFilter: ["/api/inspections", "/api/inspection-items", "/api/checklist-templates", "/api/trustee-checklists", "/api/checklist-response"],
  pathRewrite: undefined,
  on: {
    proxyReq: (proxyReq, req) => {
      // 파일 업로드/다운로드 경로는 raw body 스트리밍 (fixRequestBody 건너뛰기)
      const url = (req as IncomingMessage).url || "";
      if (url.includes("/files")) {
        return;
      }
      fixRequestBody(proxyReq, req);
    },
    proxyRes: (proxyRes, req) => {
      // 파일 다운로드 경로: iframe 미리보기를 위해 보안 헤더 완화
      const url = (req as IncomingMessage).url || "";
      if (url.includes("/api/checklist-response/files")) {
        delete proxyRes.headers["x-frame-options"];
        delete proxyRes.headers["content-security-policy"];
        proxyRes.headers["cross-origin-resource-policy"] = "cross-origin";
      }
    },
  },
});
