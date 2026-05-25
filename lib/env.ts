// Lazy env accessors: throw only when a value is actually read at request time,
// so `next build` (which doesn't execute routes) succeeds without secrets set.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  get OPENAI_API_KEY() {
    return required("OPENAI_API_KEY");
  },
  get SUPABASE_URL() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
};
