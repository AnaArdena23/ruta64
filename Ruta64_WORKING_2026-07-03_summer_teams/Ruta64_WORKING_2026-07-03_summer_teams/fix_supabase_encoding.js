const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://dzqbmgnkaoqbioujkvsj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_m-4oO3Q7Sh9LSLB2hEDjEQ_mreQImpR';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function decodeDoubleUTF8(str) {
    if (!str) return str;
    try {
        // UTF-8 bytes read as ISO-8859-1 (binary) -> decode back to UTF-8
        const decoded = Buffer.from(str, 'binary').toString('utf8');
        // Double check if it changed and looks reasonable
        return decoded;
    } catch (e) {
        return str;
    }
}

async function fix() {
    try {
        console.log("=== FIXING PARTICIPANTS ===");
        const { data: participants, error: pErr } = await supabase.from('participants').select('*');
        if (pErr) throw pErr;

        for (const p of participants) {
            const decodedName = decodeDoubleUTF8(p.name);
            if (decodedName !== p.name) {
                console.log(`Updating Participant ID: ${p.id}`);
                console.log(`  Old: "${p.name}"`);
                console.log(`  New: "${decodedName}"`);
                
                const { error: updateErr } = await supabase
                    .from('participants')
                    .update({ name: decodedName })
                    .eq('id', p.id);
                
                if (updateErr) {
                    console.error(`  Error updating ${p.id}:`, updateErr.message);
                } else {
                    console.log(`  Successfully updated!`);
                }
            }
        }

        console.log("\n=== FIXING TEAMS ===");
        const { data: teams, error: tErr } = await supabase.from('teams').select('*');
        if (tErr) throw tErr;

        for (const t of teams) {
            const decodedName = decodeDoubleUTF8(t.name);
            if (decodedName !== t.name) {
                console.log(`Updating Team ID: ${t.id}`);
                console.log(`  Old: "${t.name}"`);
                console.log(`  New: "${decodedName}"`);
                
                const { error: updateErr } = await supabase
                    .from('teams')
                    .update({ name: decodedName })
                    .eq('id', t.id);
                
                if (updateErr) {
                    console.error(`  Error updating team ${t.id}:`, updateErr.message);
                } else {
                    console.log(`  Successfully updated!`);
                }
            }
        }

        console.log("\n=== DONE ===");

    } catch (e) {
        console.error("Error during fix execution:", e);
    }
}

fix();
