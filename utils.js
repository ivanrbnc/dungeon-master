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

async function handleArmorEquip(item, player, user, supabase) {
  const currentSlot = player.equipped_armor?.[item.slot]?.name;
  if (currentSlot === item.item_name) {
    return `You already have ${item.item_name} equipped in ${item.slot}!`;
  }

  // --- Step 1: Store current equipped item (to return later) ---
  const currentItem = player.equipped_armor?.[item.slot] ? {
    item_type: 'armor',
    item_name: player.equipped_armor[item.slot].name,
    slot: item.slot,
    stats: player.equipped_armor[item.slot].stats,
    quantity: 1
  } : null;

  // --- Step 2: Decrease new item quantity from inventory ---
  const { data: invItem, error: invError } = await supabase
    .from('inventory')
    .select('id, quantity')
    .eq('discord_id', user.id)
    .eq('item_name', item.item_name)
    .eq('item_type', 'armor')
    .single();

  if (!invItem || invError) return `Failed to find ${item.item_name} in inventory.`;

  if (invItem.quantity > 1) {
    await supabase.from('inventory')
      .update({ quantity: invItem.quantity - 1 })
      .eq('id', invItem.id);
  } else {
    await supabase.from('inventory')
      .delete()
      .eq('id', invItem.id);
  }

  // --- Step 3: Update equipped armor & stats ---
  const currentStats = player.equipped_armor?.[item.slot]?.stats || {};
  const newStats = item.stats || {};
  const statChanges = {
    strength: (newStats.strength || 0) - (currentStats.strength || 0),
    intelligence: (newStats.intelligence || 0) - (currentStats.intelligence || 0),
    defense: (newStats.defense || 0) - (currentStats.defense || 0),
    agility: (newStats.agility || 0) - (currentStats.agility || 0),
    health: (newStats.health || 0) - (currentStats.health || 0)
  };

  const { error: updateError } = await supabase
    .from('users')
    .update({
      equipped_armor: { ...player.equipped_armor, [item.slot]: { name: item.item_name, stats: item.stats } },
      strength: (player.strength || 0) + statChanges.strength,
      intelligence: (player.intelligence || 0) + statChanges.intelligence,
      defense: (player.defense || 0) + statChanges.defense,
      agility: (player.agility || 0) + statChanges.agility,
      health: (player.health || 0) + statChanges.health
    })
    .eq('discord_id', user.id);

  if (updateError) return `Failed to equip ${item.item_name}.`;

  // --- Step 4: Return old item to inventory ---
  if (currentItem) {
    const { data: existingItem } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('discord_id', user.id)
      .eq('item_name', currentItem.item_name)
      .eq('item_type', 'armor')
      .single();

    if (existingItem) {
      await supabase
        .from('inventory')
        .update({ quantity: existingItem.quantity + 1 })
        .eq('id', existingItem.id);
    } else {
      await supabase.from('inventory').insert({
        discord_id: user.id,
        item_type: currentItem.item_type,
        item_name: currentItem.item_name,
        slot: currentItem.slot,
        stats: currentItem.stats,
        quantity: 1
      });
    }
  }

  return `Equipped ${item.item_name} to ${item.slot}!${currentItem ? ` Returned ${currentItem.item_name} to inventory.` : ''}`;
}

async function handleWeaponEquip(item, player, user, supabase) {
  const currentSlot = player.equipped_weapons?.[item.slot]?.name;
  if (currentSlot === item.item_name) {
    return `You already have ${item.item_name} equipped in ${item.slot}!`;
  }

  // --- Step 1: Store current equipped item (to return later) ---
  const currentItem = player.equipped_weapons?.[item.slot] ? {
    item_type: 'weapon',
    item_name: player.equipped_weapons[item.slot].name,
    slot: item.slot,
    stats: player.equipped_weapons[item.slot].stats,
    quantity: 1
  } : null;

  // --- Step 2: Decrease new item quantity from inventory ---
  const { data: invItem, error: invError } = await supabase
    .from('inventory')
    .select('id, quantity')
    .eq('discord_id', user.id)
    .eq('item_name', item.item_name)
    .eq('item_type', 'weapon')
    .single();

  if (!invItem || invError) return `Failed to find ${item.item_name} in inventory.`;

  if (invItem.quantity > 1) {
    await supabase.from('inventory')
      .update({ quantity: invItem.quantity - 1 })
      .eq('id', invItem.id);
  } else {
    await supabase.from('inventory')
      .delete()
      .eq('id', invItem.id);
  }

  // --- Step 3: Update equipped weapons & stats ---
  const currentStats = player.equipped_weapons?.[item.slot]?.stats || {};
  const newStats = item.stats || {};
  const statChanges = {
    strength: (newStats.strength || 0) - (currentStats.strength || 0),
    intelligence: (newStats.intelligence || 0) - (currentStats.intelligence || 0),
    defense: (newStats.defense || 0) - (currentStats.defense || 0),
    agility: (newStats.agility || 0) - (currentStats.agility || 0),
    health: (newStats.health || 0) - (currentStats.health || 0)
  };

  const { error: updateError } = await supabase
    .from('users')
    .update({
      equipped_weapons: { ...player.equipped_weapons, [item.slot]: { name: item.item_name, stats: item.stats } },
      strength: (player.strength || 0) + statChanges.strength,
      intelligence: (player.intelligence || 0) + statChanges.intelligence,
      defense: (player.defense || 0) + statChanges.defense,
      agility: (player.agility || 0) + statChanges.agility,
      health: (player.health || 0) + statChanges.health
    })
    .eq('discord_id', user.id);

  if (updateError) return `Failed to equip ${item.item_name}.`;

  // --- Step 4: Return old item to inventory ---
  if (currentItem) {
    const { data: existingItem } = await supabase
      .from('inventory')
      .select('id, quantity')
      .eq('discord_id', user.id)
      .eq('item_name', currentItem.item_name)
      .eq('item_type', 'weapon')
      .single();

    if (existingItem) {
      await supabase
        .from('inventory')
        .update({ quantity: existingItem.quantity + 1 })
        .eq('id', existingItem.id);
    } else {
      await supabase.from('inventory').insert({
        discord_id: user.id,
        item_type: currentItem.item_type,
        item_name: currentItem.item_name,
        slot: currentItem.slot,
        stats: currentItem.stats,
        quantity: 1
      });
    }
  }

  return `Equipped ${item.item_name} to ${item.slot}!${currentItem ? ` Returned ${currentItem.item_name} to inventory.` : ''}`;
}

async function handleConsumable(item, player, user, supabase) {
  // Fetch consumable stats from shop_consumables or unique_items
  let consumable = await supabase
    .from('shop_consumables')
    .select('stats')
    .eq('item_name', item.item_name)
    .single();

  if (!consumable.data) {
    consumable = await supabase
      .from('unique_items')
      .select('stats')
      .eq('item_name', item.item_name)
      .eq('item_type', 'consumable')
      .single();
  }

  if (consumable.error || !consumable.data) {
    return `Failed to fetch ${item.item_name} from shop_consumables or unique_items.`;
  }

  let effectApplied = false;
  let effectMessage = '';

  if (consumable.data.stats?.health) {
    const newHealth = Math.min(player.health, (player.health || 0) + consumable.data.stats.health);
    effectApplied = true;
    effectMessage += `Restored ${consumable.data.stats.health} health (current: ${newHealth}/${player.health}). `;
    const { error } = await supabase
      .from('users')
      .update({ health: newHealth })
      .eq('discord_id', user.id);
    if (error) return `Failed to apply health for ${item.item_name}.`;
  }

  if (consumable.data.stats?.strength) {
    const newStrength = (player.strength || 0) + consumable.data.stats.strength;
    effectApplied = true;
    effectMessage += `Gained ${consumable.data.stats.strength} strength (current: ${newStrength}). `;
    const { error } = await supabase
      .from('users')
      .update({ strength: newStrength })
      .eq('discord_id', user.id);
    if (error) return `Failed to apply strength for ${item.item_name}.`;
  }

  if (consumable.data.stats?.intelligence) {
    const newIntelligence = (player.intelligence || 0) + consumable.data.stats.intelligence;
    effectApplied = true;
    effectMessage += `Gained ${consumable.data.stats.intelligence} intelligence (current: ${newIntelligence}). `;
    const { error } = await supabase
      .from('users')
      .update({ intelligence: newIntelligence })
      .eq('discord_id', user.id);
    if (error) return `Failed to apply intelligence for ${item.item_name}.`;
  }

  if (consumable.data.stats?.defense) {
    const newDefense = (player.defense || 0) + consumable.data.stats.defense;
    effectApplied = true;
    effectMessage += `Gained ${consumable.data.stats.defense} defense (current: ${newDefense}). `;
    const { error } = await supabase
      .from('users')
      .update({ defense: newDefense })
      .eq('discord_id', user.id);
    if (error) return `Failed to apply defense for ${item.item_name}.`;
  }

  if (consumable.data.stats?.agility) {
    const newAgility = (player.agility || 0) + consumable.data.stats.agility;
    effectApplied = true;
    effectMessage += `Gained ${consumable.data.stats.agility} agility (current: ${newAgility}). `;
    const { error } = await supabase
      .from('users')
      .update({ agility: newAgility })
      .eq('discord_id', user.id);
    if (error) return `Failed to apply agility for ${item.item_name}.`;
  }

  if (!effectApplied) {
    return `Cannot use ${item.item_name}: no valid effects to apply!`;
  }

  // Decrease inventory quantity
  const newQuantity = item.quantity - 1;
  let updateError;
  if (newQuantity <= 0) {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('discord_id', user.id)
      .eq('item_name', item.item_name)
      .eq('item_type', 'consumable')
      .limit(1);
    updateError = error;
  } else {
    const { error } = await supabase
      .from('inventory')
      .update({ quantity: newQuantity })
      .eq('discord_id', user.id)
      .eq('item_name', item.item_name)
      .eq('item_type', 'consumable');
    updateError = error;
  }

  if (updateError) {
    return `Failed to update inventory for ${item.item_name}.`;
  }

  return `Used ${item.item_name}! ${effectMessage}`;
}

async function handleSkillUse(item, player, user, supabase) {
  if (player.skills?.includes(item.item_name)) {
    return `You have already learned ${item.item_name}!`;
  }

  // Decrease inventory quantity
  const newQuantity = item.quantity - 1;
  let updateError;
  if (newQuantity <= 0) {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('discord_id', user.id)
      .eq('item_name', item.item_name)
      .eq('item_type', 'skill')
      .limit(1);
    updateError = error;
  } else {
    const { error } = await supabase
      .from('inventory')
      .update({ quantity: newQuantity })
      .eq('discord_id', user.id)
      .eq('item_name', item.item_name)
      .eq('item_type', 'skill');
    updateError = error;
  }

  if (updateError) {
    return `Failed to update inventory for ${item.item_name}.`;
  }

  // Learn the skill
  const { error } = await supabase
    .from('users')
    .update({ skills: [...(player.skills || []), item.item_name] })
    .eq('discord_id', user.id);

  return error ? `Failed to learn ${item.item_name}.` : `Learned ${item.item_name}!`;
}

module.exports = { 
  checkRegistration, 
  handleArmorEquip, 
  handleWeaponEquip, 
  handleConsumable, 
  handleSkillUse 
};