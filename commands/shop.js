const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { checkRegistration } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse and purchase items from the shop'),
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
      const { data: player, error: playerError } = await supabase
        .from('users')
        .select('gold, skills, skill_cooldowns')
        .eq('discord_id', user.id)
        .single();

      if (playerError || !player) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Error')
          .setDescription('Error fetching your data.')
          .setFooter({ text: 'Dungeon Adventure' });
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const [{ data: armors }, { data: consumables }, { data: skills }, { data: weapons }] = await Promise.all([
        supabase.from('shop_armors').select('id, item_name, slot, stats, price'),
        supabase.from('shop_consumables').select('id, item_name, stats, price'),
        supabase.from('shop_skills').select('id, item_name, effect_scale, cooldown, price'),
        supabase.from('shop_weapons').select('id, item_name, slot, stats, price')
      ]);

      let currentCategory = 'main';
      const shopEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏪 Dungeon Shop')
        .setDescription(`Welcome, ${user.username}! You have 💰 ${player.gold} gold.\nSelect a category to browse.`)
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: 'Dungeon Adventure' });

      const categoryOptions = [
        { label: 'Armors', value: 'armor', description: `${armors.length} items available` },
        { label: 'Consumables', value: 'consumable', description: `${consumables.length} items available` },
        { label: 'Skills', value: 'skill', description: `${skills.length} items available` },
        { label: 'Weapons', value: 'weapon', description: `${weapons.length} items available` },
        { label: 'Exit', value: 'exit', description: 'Leave the shop' }
      ];

      const categoryMenu = new StringSelectMenuBuilder()
        .setCustomId('select_category')
        .setPlaceholder('Select a category...')
        .addOptions(categoryOptions);

      const row = new ActionRowBuilder().addComponents(categoryMenu);
      const message = await interaction.editReply({ embeds: [shopEmbed], components: [row] });

      let hasPurchased = false;
      const filter = i => (i.customId === 'select_category' || i.customId === 'select_item' || i.customId === 'continue' || i.customId === 'exit') && i.user.id === user.id;
      let collector = message.createMessageComponentCollector({ filter, time: 60000 });

      let shopItems = { armor: armors, consumable: consumables, skill: skills, weapon: weapons };

      collector.on('collect', async i => {
        await i.deferUpdate();
        collector.resetTimer({ time: 60000 });

        if (i.customId === 'select_category') {
          const selectedValue = i.values[0];
          if (selectedValue === 'exit') {
            const thankYouEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('🎉 Thank You for Visiting!')
              .setDescription('Thanks for stopping by the Dungeon Shop! Come back soon!')
              .setFooter({ text: 'Dungeon Adventure' });
            await i.editReply({ embeds: [thankYouEmbed], components: [] });
            collector.stop();
            return;
          }

          currentCategory = selectedValue;
          const items = shopItems[currentCategory] || [];

          let itemsText = items.length === 0 ? 'No items available in this category.' : '';
          items.forEach(item => {
            const statsText = item.stats ? ` (${Object.entries(item.stats).map(([k, v]) => `${k}: ${v}`).join(', ')})` : '';
            const scaleText = item.effect_scale ? ` (Scale: ${item.effect_scale}%)` : '';
            const cooldownText = item.cooldown ? ` (Cooldown: ${item.cooldown} actions)` : '';
            itemsText += `- ${item.item_name}${item.slot ? ` [${item.slot}]` : ''}${statsText}${scaleText}${cooldownText} - 💰 ${item.price}\n`;
          });

          const categoryEmbed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`🏪 ${currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1)} Shop`)
            .setDescription(`Current Category: ${currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1)}\nYou have 💰 ${player.gold} gold.\n${itemsText}`)
            .setFooter({ text: 'Dungeon Adventure' });

          let components = [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('select_category')
              .setPlaceholder(`Currently in: ${currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1)}`)
              .addOptions(categoryOptions)
          )];
          if (items.length > 0) {
            const itemOptions = items.map((item, index) => ({
              label: `${item.item_name} - 💰 ${item.price}`,
              description: item.stats ? Object.entries(item.stats).map(([k, v]) => `${k}: ${v}`).join(', ') : item.effect_scale ? `Scale: ${item.effect_scale}%${item.cooldown ? `, Cooldown: ${item.cooldown}` : ''}` : 'No stats',
              value: `${currentCategory}_${index}`,
            })).slice(0, 25);

            const itemMenu = new StringSelectMenuBuilder()
              .setCustomId('select_item')
              .setPlaceholder('Choose an item to purchase...')
              .addOptions(itemOptions);

            components.push(new ActionRowBuilder().addComponents(itemMenu));
          }

          await i.editReply({ embeds: [categoryEmbed], components });
        } else if (i.customId === 'select_item') {
          const [category, index] = i.values[0].split('_');
          const selectedItem = shopItems[category][parseInt(index)];

          if (player.gold < selectedItem.price) {
            const insufficientEmbed = new EmbedBuilder()
              .setColor('#FF4500')
              .setTitle('🚫 Insufficient Gold')
              .setDescription(`You need 💰 ${selectedItem.price} for ${selectedItem.item_name}, but you have ${player.gold}.`)
              .setFooter({ text: 'Dungeon Adventure' });
            await i.editReply({ embeds: [insufficientEmbed], components: [row] });
            return;
          }

          // Deduct gold
          const newGold = player.gold - selectedItem.price;
          const { error: goldError } = await supabase
            .from('users')
            .update({ gold: newGold })
            .eq('discord_id', user.id);

          if (goldError) {
            console.error('Error updating gold:', goldError);
            const errorEmbed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Purchase Failed')
              .setDescription('Error processing purchase.')
              .setFooter({ text: 'Dungeon Adventure' });
            await i.editReply({ embeds: [errorEmbed], components: [row] });
            return;
          }

          let insertError;
          if (category === 'consumable') {
            const { data: existingItem, error: checkError } = await supabase
              .from('inventory')
              .select('quantity')
              .eq('discord_id', user.id)
              .eq('item_name', selectedItem.item_name)
              .eq('item_type', 'consumable')
              .single();

            if (checkError && checkError.code !== 'PGRST116') {
              console.error('Error checking inventory:', checkError);
              await supabase.from('users').update({ gold: player.gold }).eq('discord_id', user.id);
              const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Purchase Failed')
                .setDescription(`Error checking inventory: ${checkError.message}`)
                .setFooter({ text: 'Dungeon Adventure' });
              await i.editReply({ embeds: [errorEmbed], components: [row] });
              return;
            }

            if (existingItem) {
              const newQuantity = existingItem.quantity + 1;
              ({ error: insertError } = await supabase
                .from('inventory')
                .update({ quantity: newQuantity })
                .eq('discord_id', user.id)
                .eq('item_name', selectedItem.item_name)
                .eq('item_type', 'consumable'));
            } else {
              ({ error: insertError } = await supabase
                .from('inventory')
                .insert({
                  discord_id: user.id,
                  item_type: 'consumable',
                  item_name: selectedItem.item_name,
                  slot: null,
                  stats: selectedItem.stats || null,
                  quantity: 1
                }));
            }
          } else if (category === 'skill') {
            // Check if skill exists in inventory
            const { data: existingItem, error: checkError } = await supabase
              .from('inventory')
              .select('quantity')
              .eq('discord_id', user.id)
              .eq('item_name', selectedItem.item_name)
              .eq('item_type', 'skill')
              .single();

            if (checkError && checkError.code !== 'PGRST116') {
              console.error('Error checking inventory:', checkError);
              await supabase.from('users').update({ gold: player.gold }).eq('discord_id', user.id);
              const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Purchase Failed')
                .setDescription(`Error checking inventory: ${checkError.message}`)
                .setFooter({ text: 'Dungeon Adventure' });
              await i.editReply({ embeds: [errorEmbed], components: [row] });
              return;
            }

            if (existingItem) {
              const newQuantity = existingItem.quantity + 1;
              ({ error: insertError } = await supabase
                .from('inventory')
                .update({ quantity: newQuantity })
                .eq('discord_id', user.id)
                .eq('item_name', selectedItem.item_name)
                .eq('item_type', 'skill'));
            } else {
              ({ error: insertError } = await supabase
                .from('inventory')
                .insert({
                  discord_id: user.id,
                  item_type: 'skill',
                  item_name: selectedItem.item_name,
                  slot: null,
                  stats: null,
                  quantity: 1
                }));
            }
          } else {
            const validSlots = {
              armor: ['helmet', 'chestplate', 'leggings', 'boots'],
              weapon: ['mainhand', 'offhand']
            };
            const slotValue = validSlots[category]?.includes(selectedItem.slot) ? selectedItem.slot : null;
            ({ error: insertError } = await supabase
              .from('inventory')
              .insert({
                discord_id: user.id,
                item_type: category,
                item_name: selectedItem.item_name,
                slot: slotValue,
                stats: selectedItem.stats || null,
                quantity: 1
              }));
          }

          if (insertError) {
            console.error('Error adding to inventory:', insertError);
            await supabase.from('users').update({ gold: player.gold }).eq('discord_id', user.id);
            const errorEmbed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Purchase Failed')
              .setDescription(`Error adding item to inventory: ${insertError.message}`)
              .setFooter({ text: 'Dungeon Adventure' });
            await i.editReply({ embeds: [errorEmbed], components: [row] });
            return;
          }

          // Update player gold for next interaction
          player.gold = newGold;

          const successEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Purchase Successful')
            .setDescription(`You bought **${selectedItem.item_name}** for 💰 ${selectedItem.price}!\nNew balance: 💰 ${newGold}`)
            .setFooter({ text: 'Dungeon Adventure' });

          const continueButton = new ButtonBuilder()
            .setCustomId('continue')
            .setLabel('Continue Shopping')
            .setStyle(ButtonStyle.Primary);
          const exitButton = new ButtonBuilder()
            .setCustomId('exit')
            .setLabel('Exit')
            .setStyle(ButtonStyle.Danger);

          await i.editReply({ embeds: [successEmbed], components: [new ActionRowBuilder().addComponents(continueButton, exitButton)] });
          hasPurchased = true;
        } else if (i.customId === 'continue') {
          await i.editReply({ embeds: [shopEmbed], components: [row] });
        } else if (i.customId === 'exit') {
          const thankYouEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎉 Thank You for Visiting!')
            .setDescription('Thanks for stopping by the Dungeon Shop! Come back soon!')
            .setFooter({ text: 'Dungeon Adventure' });
          await i.editReply({ embeds: [thankYouEmbed], components: [] });
          collector.stop();
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          const timeoutEmbed = new EmbedBuilder()
            .setColor('#808080')
            .setTitle('⌛ Shop Closed')
            .setDescription('The Dungeon Shop has closed due to inactivity.')
            .setFooter({ text: 'Dungeon Adventure' });
          await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
        }
      });

    } catch (error) {
      console.error('Error in shop command:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Error')
        .setDescription('An error occurred in the shop.')
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};