const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://dzqbmgnkaoqbioujkvsj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_m-4oO3Q7Sh9LSLB2hEDjEQ_mreQImpR';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
    const { data: act, error: e1 } = await supabase.from('activities').select('*');
    const { data: part, error: e2 } = await supabase.from('participants').select('*');
    const { data: map, error: e3 } = await supabase.from('map_config').select('*');
    console.log('Activities:', act ? act.length : e1);
    console.log('Participants:', part ? part.length : e2);
    console.log('Map config:', map ? map.length : e3);
}
test();
