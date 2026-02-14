// functions/debugSecrets.ts
type AnyRec = Record<string, any>;

function getSecret(name: string) {
  const hits: AnyRec = {};

  // Deno env
  try {
    hits.denoEnv = !!(globalThis as any)?.Deno?.env?.get?.(name);
  } catch {
    hits.denoEnv = "error";
  }

  // Node-style env (some runtimes shim this)
  try {
    hits.processEnv = !!(globalThis as any)?.process?.env?.[name];
  } catch {
    hits.processEnv = "error";
  }

  // Common runtime injections
  try {
    hits.global = !!(globalThis as any)?.[name];
  } catch {
    hits.global = "error";
  }

  try {
    hits.base44Secrets = !!(globalThis as any)?.base44?.secrets?.[name];
  } catch {
    hits.base44Secrets = "error";
  }

  try {
    hits.base44Config = !!(globalThis as any)?.base44?.config?.[name];
  } catch {
    hits.base44Config = "error";
  }

  // Return which channel has it (but never the value)
  return hits;
}

Deno.serve(async () => {
  const checks = getSecret("SCORECARD_API_KEY");
  return new Response(JSON.stringify({ checks, at: new Date().toISOString() }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});