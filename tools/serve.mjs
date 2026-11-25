import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 8000);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const path = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) {
      response.writeHead(403).end();
      return;
    }
    if (!(await stat(path)).isFile()) throw new Error("Missing file");
    const content = await readFile(path);
    response.writeHead(200, {
      "Content-Type":
        (mime[extname(path)] || "application/octet-stream") + "; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch {
    response
      .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      .end("Không tìm thấy tệp.");
  }
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Cổng ${port} đang được sử dụng. Đổi biến PORT hoặc dùng máy chủ đang chạy.`
      : error.message,
  );
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Smart E-Hub đang chạy tại http://127.0.0.1:${port}`),
);
