const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  EmbedBuilder,
  MessageFlags 
} = require('discord.js');
const { checkRegistration } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Manage your inventory by equipping or using items.'),
  async execute(interaction, supabase) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const { user } = interaction;

    if (!(await checkRegistration(interaction, supabase))) {
      const embed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('🚫 Not Registered')
        .setDescription(`You're not registered yet, ${user.username}! Please use \`/register\` to create your character first.`)
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    try {
      const [{ data: inventory }, { data: player }] = await Promise.all([
        supabase.from('inventory').select('item_type, item_name, slot, stats, quantity').eq('discord_id', user.id),
        supabase.from('users').select('equipped_armor, equipped_weapons, health, strength, intelligence, defense, agility, skills').eq('discord_id', user.id).single()
      ]);

      let currentCategory = 'default';
      let currentPage = 0;
      const pageSize = 10;

      // === Embed builder ===
      const buildInventoryEmbed = (category, page) => {
        const items = category === 'default' ? [] : (inventory || []).filter(item => item.item_type === category);
        const start = page * pageSize;
        const pageItems = items.slice(start, start + pageSize);
        const totalPages = Math.ceil(items.length / pageSize) || 1;

        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle(`📦 ${user.username}'s Inventory`)
          .setThumbnail(user.displayAvatarURL());

        // Always show equipped summary
        embed.addFields(
          {
            name: '🛡️ Equipped Armor',
            value: `Helmet: ${player.equipped_armor?.helmet?.name || 'None'}\nChestplate: ${player.equipped_armor?.chestplate?.name || 'None'}\nLeggings: ${player.equipped_armor?.leggings?.name || 'None'}\nBoots: ${player.equipped_armor?.boots?.name || 'None'}`,
            inline: false
          },
          {
            name: '⚔️ Equipped Weapons',
            value: `Mainhand: ${player.equipped_weapons?.mainhand?.name || 'None'}\nOffhand: ${player.equipped_weapons?.offhand?.name || 'None'}`,
            inline: false
          }
        );

        if (category === 'default') {
          if (!inventory?.length) {
            embed.addFields({ name: '🎒 Items', value: 'Your inventory is empty!', inline: false });
          }
        } else {
          const categoryDisplay = category.charAt(0).toUpperCase() + category.slice(1) + (category === 'consumable' ? 's' : category === 'skill' ? 's' : category === 'weapon' ? 's' : '');
          if (!pageItems.length) {
            embed.addFields({ name: `🎒 ${categoryDisplay}`, value: 'No items on this page!', inline: false });
          } else {
            embed.addFields({
              name: `🎒 ${categoryDisplay}`,
              value: pageItems.map(item => {
                const stats = item.stats ? ` (${Object.entries(item.stats).map(([k, v]) => `${k}: ${v}`).join(', ')})` : '';
                return `- ${item.item_name}${item.slot ? ` [${item.slot}]` : ''}${stats} (x${item.quantity})`;
              }).join('\n'),
              inline: false
            });
          }
        }

        embed.setFooter({ text: `Dungeon Adventure | Page ${page + 1}/${totalPages}` });
        return embed;
      };

      // === UI builders ===
      const categoryOptions = [
        { label: 'Armor', value: 'armor' },
        { label: 'Consumables', value: 'consumable' },
        { label: 'Skills', value: 'skill' },
        { label: 'Weapons', value: 'weapon' }
      ];

      const buildCategoryMenu = (currentCat) => {
        const placeholder = currentCat === 'default' ? 'Select a category...' : `Current category: ${currentCat}`;
        return new StringSelectMenuBuilder()
          .setCustomId('select_category')
          .setPlaceholder(placeholder)
          .addOptions(categoryOptions);
      };

      const updateSelectOptions = () => {
        if (currentCategory === 'default') return [{ label: 'No items available', value: 'none', description: 'Choose a category first' }];
        const filteredItems = (inventory || []).filter(item => item.item_type === currentCategory);
        return filteredItems.length > 0
          ? filteredItems.map((item, index) => ({
              label: `${item.item_name}`,
              description: `Qty: ${item.quantity}${item.slot ? ` | Slot: ${item.slot}` : ''}`,
              value: index.toString()
            })).slice(0, 25)
          : [{ label: 'No items available', value: 'none', description: 'This category is empty' }];
      };

      let selectOptions = updateSelectOptions();
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_item')
        .setPlaceholder('Choose an item...')
        .setDisabled(selectOptions[0].value === 'none')
        .addOptions(selectOptions);

      const prevButton = new ButtonBuilder().setCustomId('prev_page').setLabel('◀️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(true);
      const nextButton = new ButtonBuilder().setCustomId('next_page').setLabel('Next ▶️').setStyle(ButtonStyle.Secondary).setDisabled(true);

      let categoryMenu = buildCategoryMenu(currentCategory);
      let actionRow = new ActionRowBuilder().addComponents(categoryMenu);
      const itemRow = new ActionRowBuilder().addComponents(selectMenu);
      const navRow = new ActionRowBuilder().addComponents(prevButton, nextButton);

      // === Initial reply ===
      const message = await interaction.editReply({ 
        embeds: [buildInventoryEmbed(currentCategory, currentPage)], 
        components: [actionRow, itemRow, navRow] 
      });

      // === Collector ===
      const filter = i => i.user.id === user.id;
      const collector = message.createMessageComponentCollector({ filter });

      collector.on('collect', async i => {
        await i.deferUpdate();

        if (i.customId === 'select_category') {
          currentCategory = i.values[0];
          currentPage = 0;
          selectOptions = updateSelectOptions();
          selectMenu.setOptions(selectOptions).setDisabled(selectOptions[0].value === 'none');
          
          // Update category menu placeholder
          categoryMenu = buildCategoryMenu(currentCategory);
          actionRow = new ActionRowBuilder().addComponents(categoryMenu);
          
          await i.editReply({ embeds: [buildInventoryEmbed(currentCategory, currentPage)], components: [actionRow, itemRow, navRow] });
        }

        else if (i.customId === 'prev_page' || i.customId === 'next_page') {
          const items = (inventory || []).filter(item => item.item_type === currentCategory);
          const totalPages = Math.ceil(items.length / pageSize);
          if (i.customId === 'prev_page') currentPage = Math.max(0, currentPage - 1);
          if (i.customId === 'next_page') currentPage = Math.min(totalPages - 1, currentPage + 1);
          prevButton.setDisabled(currentPage === 0);
          nextButton.setDisabled(currentPage === totalPages - 1);
          await i.editReply({ embeds: [buildInventoryEmbed(currentCategory, currentPage)], components: [actionRow, itemRow, navRow] });
        }

        else if (i.customId === 'select_item') {
          if (selectOptions[0].value === 'none') return;
          const selectedIndex = parseInt(i.values[0]);
          const selectedItem = (inventory || []).filter(item => item.item_type === currentCategory)[selectedIndex];
          let resultEmbed;

          switch (selectedItem.item_type) {
            case 'armor':
              resultEmbed = new EmbedBuilder().setColor('#00BFFF').setTitle('🛡️ Armor Equipped').setDescription(await handleArmorEquip(selectedItem, player, user, supabase));
              break;
            case 'weapon':
              resultEmbed = new EmbedBuilder().setColor('#FF4500').setTitle('⚔️ Weapon Equipped').setDescription(await handleWeaponEquip(selectedItem, player, user, supabase));
              break;
            case 'consumable':
              resultEmbed = new EmbedBuilder().setColor('#32CD32').setTitle('💊 Consumable Used').setDescription(await handleConsumable(selectedItem, player, user, supabase));
              break;
            case 'skill':
              resultEmbed = new EmbedBuilder().setColor('#9370DB').setTitle('📚 Skill Learned').setDescription(await handleSkillUse(selectedItem, player, user, supabase));
              break;
            default:
              resultEmbed = new EmbedBuilder().setColor('#FFA500').setTitle('⚠️ Cannot Use').setDescription(`You can't use ${selectedItem.item_name} right now.`);
          }
          const continueButton = new ButtonBuilder().setCustomId('continue').setLabel('Continue').setStyle(ButtonStyle.Primary);
          await i.editReply({ embeds: [resultEmbed], components: [new ActionRowBuilder().addComponents(continueButton)] });
        }

        else if (i.customId === 'continue') {
          // Refresh inventory and player data after an action
          const [newInventory, newPlayer] = await Promise.all([
            supabase.from('inventory').select('item_type, item_name, slot, stats, quantity').eq('discord_id', user.id),
            supabase.from('users').select('equipped_armor, equipped_weapons, health, strength, intelligence, defense, agility, skills').eq('discord_id', user.id).single()
          ]);
          inventory.length = 0; // Clear and update inventory
          inventory.push(...(newInventory.data || []));
          Object.assign(player, newPlayer.data); // Update player data
          
          selectOptions = updateSelectOptions();
          selectMenu.setOptions(selectOptions).setDisabled(selectOptions[0].value === 'none');
          await i.editReply({ embeds: [buildInventoryEmbed(currentCategory, currentPage)], components: [actionRow, itemRow, navRow] });
        }
      });

      collector.on('end', async () => {
        await interaction.editReply({ embeds: [buildInventoryEmbed(currentCategory, currentPage)], components: [] }).catch(() => {});
      });

    } catch (error) {
      console.error('Error in inventory command:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Error')
        .setDescription('An error occurred while fetching your inventory.')
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

// === Handlers ===
async function handleArmorEquip(item, player, user, supabase) {
  const currentSlot = player.equipped_armor?.[item.slot]?.name;
  if (currentSlot === item.item_name) return `You already have ${item.item_name} equipped in ${item.slot}!`;

  // Calculate stat changes
  const currentStats = player.equipped_armor?.[item.slot]?.stats || {};
  const newStats = item.stats || {};
  const statChanges = {
    strength: (newStats.strength || 0) - (currentStats.strength || 0),
    intelligence: (newStats.intelligence || 0) - (currentStats.intelligence || 0),
    defense: (newStats.defense || 0) - (currentStats.defense || 0),
    agility: (newStats.agility || 0) - (currentStats.agility || 0),
    health: (newStats.health || 0) - (currentStats.health || 0)
  };

  // Update equipped armor and stats
  const { error } = await supabase
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

  if (error) return `Failed to equip ${item.item_name}.`;

  // Decrease inventory quantity
  const newQuantity = item.quantity - 1;
  let inventoryError;
  if (newQuantity <= 0) {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('discord_id', user.id)
      .eq('item_name', item.item_name)
      .limit(1);
    inventoryError = error;
  } else {
    const { error } = await supabase
      .from('inventory')
      .update({ quantity: newQuantity })
      .eq('discord_id', user.id)
      .eq('item_name', item.item_name);
    inventoryError = error;
  }

  return inventoryError ? `Equipped ${item.item_name} to ${item.slot}, but failed to update inventory.` : `Equipped ${item.item_name} to ${item.slot}!`;
}

async function handleWeaponEquip(item, player, user, supabase) {
  const currentSlot = player.equipped_weapons?.[item.slot]?.name;
  if (currentSlot === item.item_name) return `You already have ${item.item_name} equipped in ${item.slot}!`;

  // Calculate stat changes
  const currentStats = player.equipped_weapons?.[item.slot]?.stats || {};
  const newStats = item.stats || {};
  const statChanges = {
    strength: (newStats.strength || 0) - (currentStats.strength || 0),
    intelligence: (newStats.intelligence || 0) - (currentStats.intelligence || 0),
    defense: (newStats.defense || 0) - (currentStats.defense || 0),
    agility: (newStats.agility || 0) - (currentStats.agility || 0),
    health: (newStats.health || 0) - (currentStats.health || 0)
  };

  // Update equipped weapons and stats
  const { error } = await supabase
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

  if (error) return `Failed to equip ${item.item_name}.`;

  // Decrease inventory quantity
  const newQuantity = item.quantity - 1;
  let inventoryError;
  if (newQuantity <= 0) {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('discord_id', user.id)
      .eq('item_name', item.item_name)
      .limit(1);
    inventoryError = error;
  } else {
    const { error } = await supabase
      .from('inventory')
      .update({ quantity: newQuantity })
      .eq('discord_id', user.id)
      .eq('item_name', item.item_name);
    inventoryError = error;
  }

  return inventoryError ? `Equipped ${item.item_name} to ${item.slot}, but failed to update inventory.` : `Equipped ${item.item_name} to ${item.slot}!`;
}

async function handleConsumable(item, player, user, supabase) {
  // Fetch consumable stats from shop_consumables
  const { data: consumable, error: fetchError } = await supabase
    .from('shop_consumables')
    .select('stats')
    .eq('item_name', item.item_name)
    .single();

  if (fetchError || !consumable) {
    return `Failed to fetch ${item.item_name} from shop_consumables. Please ensure the item exists in the shop.`;
  }

  // Initialize temporary stats
  let tempStats = {
    health: player.health, // Temporary health, capped at max
    strength: player.strength || 0,
    intelligence: player.intelligence || 0,
    defense: player.defense || 0,
    agility: player.agility || 0
  };

  // Check if all applicable effects are at max
  let allAtMax = true;
  let effectApplied = false;
  let effectMessage = '';

  if (consumable.stats?.health && tempStats.health < player.health) {
    tempStats.health = Math.min(player.health, tempStats.health + consumable.stats.health);
    effectApplied = true;
    allAtMax = false;
    effectMessage += `Restored ${consumable.stats.health} health (current: ${tempStats.health}/${player.health}). `;
  } else if (consumable.stats?.health) {
    effectMessage += `Health already at max (${player.health}). `;
  }

  if (consumable.stats?.strength && tempStats.strength < player.strength) {
    tempStats.strength = Math.min(player.strength, tempStats.strength + consumable.stats.strength);
    effectApplied = true;
    allAtMax = false;
    effectMessage += `Gained ${consumable.stats.strength} strength (current: ${tempStats.strength}/${player.strength}). `;
  } else if (consumable.stats?.strength) {
    effectMessage += `Strength already at max (${player.strength}). `;
  }

  if (!effectApplied && allAtMax) {
    return `Cannot use ${item.item_name}: all affected stats are at their maximum!`;
  }

  if (!effectApplied) {
    return `Used ${item.item_name}, but no valid effect applied.`;
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
      .limit(1);
    updateError = error;
  } else {
    const { error } = await supabase
      .from('inventory')
      .update({ quantity: newQuantity })
      .eq('discord_id', user.id)
      .eq('item_name', item.item_name);
    updateError = error;
  }

  if (updateError) {
    return `Failed to update inventory for ${item.item_name}.`;
  }

  return `Used ${item.item_name}! ${effectMessage}`;
}

async function handleSkillUse(item, player, user, supabase) {
  // Check if skill is already learned
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
      .limit(1);
    updateError = error;
  } else {
    const { error } = await supabase
      .from('inventory')
      .update({ quantity: newQuantity })
      .eq('discord_id', user.id)
      .eq('item_name', item.item_name);
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