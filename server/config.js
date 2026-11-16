// Configuração lida das variáveis de ambiente (arquivo .env em desenvolvimento,
// painel do provedor de hospedagem em produção). Veja .env.example.

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    // Se DATABASE_URL existir, usa PostgreSQL (ex.: Neon, Supabase, Railway).
    // Senão, usa um arquivo SQLite local (perfeito para rodar no PC ou num servidor com disco).
    databaseUrl: env.DATABASE_URL || '',
    sqlitePath: env.SQLITE_PATH || 'data/app.db',
    isProd: env.NODE_ENV === 'production',
    // Por segurança, só a PRIMEIRA conta pode ser criada. Coloque true para liberar novos cadastros.
    allowSignup: env.ALLOW_SIGNUP === 'true',
    timeZone: env.APP_TIMEZONE || 'America/Sao_Paulo',
    sessionDays: Number(env.SESSION_DAYS) || 60,
    pluggy: {
      clientId: env.PLUGGY_CLIENT_ID || '',
      clientSecret: env.PLUGGY_CLIENT_SECRET || '',
      baseUrl: env.PLUGGY_API_URL || 'https://api.pluggy.ai',
    },
  };
}
