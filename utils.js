// Updated utils.js - Improved error handling and logging for registration check
async function checkRegistration(interaction, supabase) {
  const { user } = interaction;
  console.log('Checking registration for user ID:', user.id);
  
  const { data: existingUser, error: fetchError } = await supabase
    .from('users')
    .select('discord_id')
    .eq('discord_id', user.id)
    .single();

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {  // No rows returned - user not found
      return false;
    }
    console.error('Database error checking registration:', fetchError);
    return false;  // Don't reply here; let the command handle errors
  }

  return !!existingUser;  // Return true if user exists
}

module.exports = { checkRegistration };