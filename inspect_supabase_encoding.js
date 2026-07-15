const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://dzqbmgnkaoqbioujkvsj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_m-4oO3Q7Sh9LSLB2hEDjEQ_mreQImpR';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspect() {
    try {
        console.log("--- Fetching participants ---");
        const { data: participants, error: pErr } = await supabase.from('participants').select('*');
        if (pErr) throw pErr;

        console.log(`Found ${participants.length} participants:`);
        participants.forEach(p => {
            console.log(`ID: ${p.id} | Name: ${p.name}`);
        });

    } catch (e) {
        console.error("Error during inspection:", e);
    }
}

inspect();
