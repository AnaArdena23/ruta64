const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://dzqbmgnkaoqbioujkvsj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_m-4oO3Q7Sh9LSLB2hEDjEQ_mreQImpR';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
    console.log("Testing update active=false...");
    const { data, error } = await supabase.from('participants').update({ active: false }).eq('id', '23b83a3e-4a07-4c32-aa0f-a52eb920353b');
    console.log("Update Error:", error);

    console.log("Testing insert...");
    const { data: d2, error: e2 } = await supabase.from('participants').insert([{ name: 'Test User', team_id: 'e6736405-927a-4fc2-86c9-16e7a7502629', active: true }]);
    console.log("Insert Error:", e2);
}
test();
