export type ServerEnvironment = {
  supabaseUrl: string;
  supabaseSecretKey: string;
  supabasePublishableKey: string;
};

function required(name: string, value: string | undefined) {
  if (!value?.trim()) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

export function readServerEnvironment(env: NodeJS.ProcessEnv = process.env): ServerEnvironment {
  return {
    supabaseUrl: required("SUPABASE_URL", env.SUPABASE_URL),
    supabaseSecretKey: required("SUPABASE_SECRET_KEY", env.SUPABASE_SECRET_KEY),
    supabasePublishableKey: required("VITE_SUPABASE_PUBLISHABLE_KEY", env.VITE_SUPABASE_PUBLISHABLE_KEY)
  };
}
