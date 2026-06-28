function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
}

export default function handler(_req, res) {
  setCors(res);
  res.status(200).json({
    // Only explicit PUBLIC_SITE_URL — never VERCEL_URL (preview deploys may require Vercel login)
    publicSiteUrl: process.env.PUBLIC_SITE_URL || '',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  });
}
