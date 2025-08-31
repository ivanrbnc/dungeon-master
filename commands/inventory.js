const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  EmbedBuilder,
} = require('discord.js');
const { checkRegistration, handleArmorEquip, handleWeaponEquip, handleConsumable, handleSkillUse } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Manage your inventory by equipping or using items.'),
  async execute(interaction, supabase) {
    await interaction.deferReply();
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
      const collector = message.createMessageComponentCollector({ filter, time: 60000 }); // Add 60-second time limit
      collector.on('collect', async i => {
        await i.deferUpdate();
        collector.resetTimer({ time: 60000 }); // Reset timer on interaction
        if (i.customId === 'select_category') {
          currentCategory = i.values[0];
          currentPage = 0;
          selectOptions = updateSelectOptions();
          selectMenu.setOptions(selectOptions).setDisabled(selectOptions[0].value === 'none');
          categoryMenu = buildCategoryMenu(currentCategory);
          actionRow = new ActionRowBuilder().addComponents(categoryMenu);
          await i.editReply({ embeds: [buildInventoryEmbed(currentCategory, currentPage)], components: [actionRow, itemRow, navRow] });
        } else if (i.customId === 'prev_page' || i.customId === 'next_page') {
          const items = (inventory || []).filter(item => item.item_type === currentCategory);
          const totalPages = Math.ceil(items.length / pageSize);
          if (i.customId === 'prev_page') currentPage = Math.max(0, currentPage - 1);
          if (i.customId === 'next_page') currentPage = Math.min(totalPages - 1, currentPage + 1);
          prevButton.setDisabled(currentPage === 0);
          nextButton.setDisabled(currentPage === totalPages - 1);
          await i.editReply({ embeds: [buildInventoryEmbed(currentCategory, currentPage)], components: [actionRow, itemRow, navRow] });
        } else if (i.customId === 'select_item') {
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
        } else if (i.customId === 'continue') {
          const [newInventory, newPlayer] = await Promise.all([
            supabase.from('inventory').select('item_type, item_name, slot, stats, quantity').eq('discord_id', user.id),
            supabase.from('users').select('equipped_armor, equipped_weapons, health, strength, intelligence, defense, agility, skills').eq('discord_id', user.id).single()
          ]);
          inventory.length = 0;
          inventory.push(...(newInventory.data || []));
          Object.assign(player, newPlayer.data);
          selectOptions = updateSelectOptions();
          selectMenu.setOptions(selectOptions).setDisabled(selectOptions[0].value === 'none');
          await i.editReply({ embeds: [buildInventoryEmbed(currentCategory, currentPage)], components: [actionRow, itemRow, navRow] });
        }
      });
      collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          const timeoutEmbed = new EmbedBuilder()
            .setColor('#808080')
            .setTitle('⌛ Inventory Closed')
            .setDescription('Your inventory has closed due to inactivity.')
            .setFooter({ text: 'Dungeon Adventure' });
          await interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
        } else {
          await interaction.editReply({ embeds: [buildInventoryEmbed(currentCategory, currentPage)], components: [] }).catch(() => {});
        }
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