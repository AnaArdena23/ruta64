// Configuración de Supabase
const SUPABASE_URL = 'https://dzqbmgnkaoqbioujkvsj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_m-4oO3Q7Sh9LSLB2hEDjEQ_mreQImpR';

// Inicializar el cliente
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Exportar para uso en app.js (vía global window)
window.supabase = supabaseClient;

console.log('Supabase Client Initialized');
