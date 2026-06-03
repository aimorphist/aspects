import { defineCommand } from "citty";
import { FilesystemStore } from "../store/filesystem";
import type { SearchParams } from "../store/types";
import type { Aspect } from "../lib/types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleRequest(
  req: Request,
  path: string,
  store: FilesystemStore
): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;

  // GET /api/v1/registry
  if (method === "GET" && path === "/api/v1/registry") {
    const aspects = await store.list();
    return json({ total: aspects.length, aspects });
  }

  // GET /api/v1/stats
  if (method === "GET" && path === "/api/v1/stats") {
    const aspects = await store.list();
    const schemas = await store.listSchemas();
    return json({
      aspects: aspects.length,
      schemas: schemas.length,
    });
  }

  // GET /api/v1/search?q=...
  if (method === "GET" && path === "/api/v1/search") {
    const params: SearchParams = {
      q: url.searchParams.get("q") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      trust: url.searchParams.get("trust") ?? undefined,
      implements: url.searchParams.get("implements") ?? undefined,
      limit: url.searchParams.has("limit")
        ? parseInt(url.searchParams.get("limit")!, 10)
        : undefined,
      offset: url.searchParams.has("offset")
        ? parseInt(url.searchParams.get("offset")!, 10)
        : undefined,
    };
    const result = await store.search(params);
    return json(result);
  }

  // GET /api/v1/aspects/blob/:hash
  if (method === "GET" && path.startsWith("/api/v1/aspects/blob/")) {
    const hash = path.slice("/api/v1/aspects/blob/".length);
    if (!hash) return json({ error: "missing_hash" }, 400);
    const aspect = await store.getByHash(hash);
    if (!aspect) return json({ error: "not_found" }, 404);
    return json(aspect);
  }

  // GET /api/v1/aspects/:name/:version
  const versionMatch = path.match(/^\/api\/v1\/aspects\/([^/]+)\/([^/]+)$/);
  if (method === "GET" && versionMatch) {
    const [, name, version] = versionMatch;
    const aspect = await store.getVersion(name!, version!);
    if (!aspect) return json({ error: "not_found" }, 404);
    return json(aspect);
  }

  // GET /api/v1/aspects/:name
  const aspectMatch = path.match(/^\/api\/v1\/aspects\/([^/]+)$/);
  if (method === "GET" && aspectMatch) {
    const [, name] = aspectMatch;
    const detail = await store.getAspect(name!);
    if (!detail) return json({ error: "not_found" }, 404);
    return json(detail);
  }

  // POST /api/v1/aspects
  if (method === "POST" && path === "/api/v1/aspects") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const aspect = body as Aspect & { publisher?: string };
    if (!aspect || typeof aspect !== "object") {
      return json({ error: "invalid_body" }, 400);
    }
    if (!aspect.name || !aspect.version) {
      return json({ error: "missing_fields", message: "name and version are required" }, 400);
    }

    const publisher = aspect.publisher ?? "local";
    try {
      const result = await store.publish(aspect, publisher);
      return json(result, result.created ? 201 : 200);
    } catch (err) {
      return json({ error: "publish_failed", message: String(err) }, 409);
    }
  }

  // GET /api/v1/schemas/:ref (ref may contain slashes)
  if (method === "GET" && path.startsWith("/api/v1/schemas/")) {
    const ref = decodeURIComponent(path.slice("/api/v1/schemas/".length));
    if (!ref) return json({ error: "missing_ref" }, 400);
    const schema = await store.resolveSchema(ref);
    if (!schema) return json({ error: "not_found" }, 404);
    return json({ ref, schema });
  }

  return json({ error: "not_found", path }, 404);
}

export default defineCommand({
  meta: {
    name: "serve",
    description: "Run a local aspects registry server for development",
  },
  args: {
    port: {
      type: "string",
      description: "Port to listen on",
      default: "5555",
    },
    dir: {
      type: "string",
      description: "Directory to serve from (default: ./registry)",
      default: "./registry",
    },
  },
  async run({ args }) {
    const port = parseInt(args.port as string, 10);
    const dir = args.dir as string;
    const store = new FilesystemStore(dir);

    console.log(`Starting local aspects registry...`);
    console.log(`  Directory: ${dir}`);
    console.log(`  URL: http://localhost:${port}`);
    console.log();

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    Bun.serve({
      port,
      async fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;

        if (req.method === "OPTIONS") {
          return new Response(null, { headers: corsHeaders });
        }

        const start = Date.now();
        let status = 200;

        try {
          const response = await handleRequest(req, path, store);
          status = response.status;
          for (const [k, v] of Object.entries(corsHeaders)) {
            response.headers.set(k, v);
          }
          console.log(`${req.method} ${path} ${status} ${Date.now() - start}ms`);
          return response;
        } catch (err) {
          status = 500;
          console.log(`${req.method} ${path} ${status} ${Date.now() - start}ms — ${err}`);
          return new Response(
            JSON.stringify({ error: "internal_error", message: String(err) }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      },
    });

    console.log(`Local registry running at http://localhost:${port}`);
    console.log(`Press Ctrl+C to stop`);
  },
});
