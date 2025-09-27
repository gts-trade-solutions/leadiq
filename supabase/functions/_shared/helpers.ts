// helpers.ts (optional shared file per function folder if you prefer)
export const cors = (res: Response) =>
  new Response(res.body, {
    ...res,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...(res.headers || {})
    }
  });

export const ok = (data: any, init: number = 200) => cors(new Response(JSON.stringify(data), { status: init, headers: { "Content-Type": "application/json" }}));
export const bad = (msg: string, code = 400, extra?: any) => ok({error: msg, ...extra}, code);
