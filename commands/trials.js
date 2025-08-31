const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { checkRegistration } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trial')
    .setDescription('Participate in trials against powerful monsters'),
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
      const [{ data: player }, { data: monsters }, { data: shopConsumables }, { data: inventory }] = await Promise.all([
        supabase
          .from('users')
          .select('health, strength, intelligence, defense, agility, equipped_armor, equipped_weapons, skills, skill_cooldowns, gold, username')
          .eq('discord_id', user.id)
          .single(),
        supabase
          .from('monsters')
          .select('*'),
        supabase
          .from('shop_consumables')
          .select('item_name, stats'),
        supabase
          .from('inventory')
          .select('item_name, quantity')
          .eq('discord_id', user.id)
          .eq('item_type', 'consumable')
      ]);

      if (!player || !monsters?.length) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Error')
          .setDescription(!player ? 'Error fetching your data.' : 'No monsters available.')
          .setFooter({ text: 'Dungeon Adventure' });
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const monster = monsters[Math.floor(Math.random() * monsters.length)];
      let monsterHealth = monster.health;

      const playerStats = {
        strength: player.strength || 0,
        intelligence: player.intelligence || 0,
        defense: player.defense || 0,
        agility: player.agility || 0,
      };

      let tempPlayerHealth = player.health;
      let tempStats = { ...playerStats };
      let cooldowns = { ...player.skill_cooldowns };
      let inventoryItems = inventory.reduce((acc, item) => {
        acc[item.item_name] = item.quantity;
        return acc;
      }, {});

      const combatEmbed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle(`⚔️ Trial: ${monster.name}`)
        .setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\nChoose your action!`)
        .setFooter({ text: 'Dungeon Adventure' });

      const skillOptions = (player.skills || []).reduce((options, skill, index) => {
        if (!cooldowns[skill] || cooldowns[skill] <= 0) {
          options.push({ label: skill, value: `skill_${index}` });
        }
        return options;
      }, []);
      if (!skillOptions.length) {
        skillOptions.push({ label: 'No skills available', value: 'skill_none', description: 'Learn skills or wait for cooldowns!' });
      }

      const skillMenu = new StringSelectMenuBuilder()
        .setCustomId('select_skill')
        .setPlaceholder('Use a skill...')
        .setDisabled(skillOptions[0].value === 'skill_none')
        .addOptions(skillOptions.slice(0, 25));

      const consumableOptions = shopConsumables.reduce((options, item) => {
        if (inventoryItems[item.item_name] > 0) {
            options.push({ label: `${item.item_name} (${inventoryItems[item.item_name]})`, value: `item_${item.item_name}` });
        }
        return options;
        }, []);

        // Add a placeholder option only if there are no consumables
        if (!consumableOptions.length) {
        consumableOptions.push({ label: 'No consumables available', value: 'item_none', description: 'Purchase consumables from the shop!' });
        }

        const consumableMenu = new StringSelectMenuBuilder()
        .setCustomId('select_consumable')
        .setPlaceholder('Use a consumable...')
        .setDisabled(!consumableOptions.length || consumableOptions[0].value === 'item_none') // Disable if no valid consumables
        .addOptions(consumableOptions.slice(0, 25));

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId('attack').setLabel('Attack').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('flee').setLabel('Flee').setStyle(ButtonStyle.Danger)
        );
      const skillRow = new ActionRowBuilder().addComponents(skillMenu);
      const consumableRow = new ActionRowBuilder().addComponents(consumableMenu);

      const message = await interaction.editReply({
        embeds: [combatEmbed],
        components: [buttons, skillRow, consumableRow],
      });

      const filter = i => (i.customId === 'attack' || i.customId === 'flee' || i.customId === 'select_skill' || i.customId === 'select_consumable') && i.user.id === user.id;
      const collector = message.createMessageComponentCollector({ filter, time: 300000 });

      collector.on('collect', async i => {
        await i.deferUpdate();
        collector.resetTimer({ time: 300000 });

        consumableMenu.setDisabled(false);
        skillMenu.setDisabled(skillOptions[0].value === 'skill_none');
        buttons.components.forEach(button => button.setDisabled(false));

        let changed = false;
        for (const skill in cooldowns) {
          if (cooldowns[skill] > 0) {
            cooldowns[skill] = Math.max(0, cooldowns[skill] - 1);
            changed = true;
          }
        }
        if (changed) {
          const { error } = await supabase
            .from('users')
            .update({ skill_cooldowns: cooldowns })
            .eq('discord_id', user.id);
          if (error) console.error('Error updating cooldowns:', error);
        }

        let actionResult = '';
        let damageToMonster = 0;
        let damageToPlayer = 0;

        if (i.customId === 'attack') {
          damageToMonster = tempStats.strength;
          if (player.equipped_weapons?.mainhand?.stats?.strength) {
            damageToMonster += player.equipped_weapons.mainhand.stats.strength;
          }
          if (player.equipped_weapons?.offhand?.stats?.strength) {
            damageToMonster += player.equipped_weapons.offhand.stats.strength;
          }
          damageToMonster = Math.max(1, Math.floor(damageToMonster * (1 + tempStats.agility / 100)));
          damageToPlayer = Math.max(1, monster.strength - Math.floor(tempStats.defense * 0.5));
          actionResult = `You attacked for ${damageToMonster} damage! Monster deals ${damageToPlayer} damage.`;
        } else if (i.customId === 'select_skill') {
          if (i.values[0] === 'skill_none') {
            await i.editReply({ embeds: [combatEmbed], components: [buttons, skillRow, consumableRow] });
            return;
          }
          const skillIndex = parseInt(i.values[0].replace('skill_', ''));
          const skillName = player.skills[skillIndex];

          if (cooldowns[skillName] > 0) {
            actionResult = `${skillName} is on cooldown for ${cooldowns[skillName]} more actions!`;
            const updatedSkillOptions = (player.skills || []).reduce((options, skill, index) => {
              if (!cooldowns[skill] || cooldowns[skill] <= 0) {
                options.push({ label: skill, value: `skill_${index}` });
              }
              return options;
            }, []);
            if (!updatedSkillOptions.length) {
              updatedSkillOptions.push({ label: 'No skills available', value: 'skill_none', description: 'Learn skills or wait for cooldowns!' });
            }
            skillMenu.setOptions(updatedSkillOptions.slice(0, 25)).setDisabled(updatedSkillOptions[0].value === 'skill_none');
            await i.editReply({ embeds: [combatEmbed.setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)], components: [buttons, skillRow, consumableRow] });
            return;
          }

          // Fetch skill effect scale and cooldown
          const { data: skill } = await supabase
            .from('shop_skills')
            .select('effect_scale, cooldown')
            .eq('item_name', skillName)
            .order('effect_scale', { ascending: false })
            .limit(1)
            .single();

          if (skill) {
            damageToMonster = Math.floor(tempStats.intelligence * (skill.effect_scale / 100));
            damageToPlayer = Math.max(1, monster.strength - Math.floor(tempStats.defense * 0.5));
            cooldowns[skillName] = skill.cooldown || 3; // Use dynamic cooldown, fallback to 3 if not set
            const { error } = await supabase
              .from('users')
              .update({ skill_cooldowns: cooldowns })
              .eq('discord_id', user.id);
            if (error) console.error('Error setting cooldown:', error);
            actionResult = `Used ${skillName} for ${damageToMonster} damage! Monster deals ${damageToPlayer} damage.`;
          } else {
            actionResult = `Error: ${skillName} not found in shop_skills.`;
            const updatedSkillOptions = (player.skills || []).reduce((options, skill, index) => {
              if (!cooldowns[skill] || cooldowns[skill] <= 0) {
                options.push({ label: skill, value: `skill_${index}` });
              }
              return options;
            }, []);
            if (!updatedSkillOptions.length) {
              updatedSkillOptions.push({ label: 'No skills available', value: 'skill_none', description: 'Learn skills or wait for cooldowns!' });
            }
            skillMenu.setOptions(updatedSkillOptions.slice(0, 25)).setDisabled(updatedSkillOptions[0].value === 'skill_none');
            await i.editReply({ embeds: [combatEmbed.setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)], components: [buttons, skillRow, consumableRow] });
            return;
          }
        } else if (i.customId === 'select_consumable') {
          if (i.values[0] === 'item_none') {
            consumableMenu.setDisabled(false);
            await i.editReply({ embeds: [combatEmbed], components: [buttons, skillRow, consumableRow] });
            return;
          }
          const itemName = i.values[0].replace('item_', '');

          const { data: itemCheck, error: checkError } = await supabase
            .from('inventory')
            .select('quantity')
            .eq('discord_id', user.id)
            .eq('item_name', itemName)
            .eq('item_type', 'consumable')
            .single();
          if (checkError || !itemCheck || itemCheck.quantity <= 0) {
            actionResult = `You don't have any ${itemName} left!`;
            const { data: updatedInventory, error: inventoryError } = await supabase
              .from('inventory')
              .select('item_name, quantity')
              .eq('discord_id', user.id)
              .eq('item_type', 'consumable');
            if (!inventoryError) {
              inventoryItems = updatedInventory.reduce((acc, item) => {
                acc[item.item_name] = item.quantity;
                return acc;
              }, {});
            }
            const updatedConsumableOptions = shopConsumables.reduce((options, item) => {
              if (inventoryItems[item.item_name] > 0) {
                options.push({ label: `${item.item_name} (${inventoryItems[item.item_name]})`, value: `item_${item.item_name}` });
              }
              return options;
            }, []);
            if (!updatedConsumableOptions.length) {
              updatedConsumableOptions.push({ label: 'No consumables available', value: 'item_none', description: 'Purchase consumables from the shop!' });
            }
            consumableMenu.setOptions(updatedConsumableOptions.slice(0, 25)).setDisabled(updatedConsumableOptions[0].value === 'item_none');
            consumableMenu.setDisabled(false);
            await i.editReply({ embeds: [combatEmbed.setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)], components: [buttons, skillRow, consumableRow] });
            return;
          }

          const newQuantity = itemCheck.quantity - 1;
          const { error: updateError } = await supabase
            .from('inventory')
            .update({ quantity: newQuantity })
            .eq('discord_id', user.id)
            .eq('item_name', itemName)
            .eq('item_type', 'consumable');

          if (updateError) {
            actionResult = `Failed to update inventory for ${itemName}.`;
            console.error('Error updating inventory:', updateError);
            const { data: updatedInventory, error: inventoryError } = await supabase
              .from('inventory')
              .select('item_name, quantity')
              .eq('discord_id', user.id)
              .eq('item_type', 'consumable');
            if (!inventoryError) {
              inventoryItems = updatedInventory.reduce((acc, item) => {
                acc[item.item_name] = item.quantity;
                return acc;
              }, {});
            }
            const updatedConsumableOptions = shopConsumables.reduce((options, item) => {
              if (inventoryItems[item.item_name] > 0) {
                options.push({ label: `${item.item_name} (${inventoryItems[item.item_name]})`, value: `item_${item.item_name}` });
              }
              return options;
            }, []);
            if (!updatedConsumableOptions.length) {
              updatedConsumableOptions.push({ label: 'No consumables available', value: 'item_none', description: 'Purchase consumables from the shop!' });
            }
            consumableMenu.setOptions(updatedConsumableOptions.slice(0, 25)).setDisabled(updatedConsumableOptions[0].value === 'item_none');
            consumableMenu.setDisabled(false);
            await i.editReply({ embeds: [combatEmbed.setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)], components: [buttons, skillRow, consumableRow] });
            return;
          }

          if (newQuantity <= 0) {
            delete inventoryItems[itemName];
          } else {
            inventoryItems[itemName] = newQuantity;
          }

          const { data: updatedInventory, error: inventoryError } = await supabase
            .from('inventory')
            .select('item_name, quantity')
            .eq('discord_id', user.id)
            .eq('item_type', 'consumable');
          if (inventoryError) {
            console.error('Error refreshing inventory:', inventoryError);
            actionResult = `Failed to refresh inventory data after using ${itemName}.`;
            consumableMenu.setDisabled(false);
            await i.editReply({ embeds: [combatEmbed.setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)], components: [buttons, skillRow, consumableRow] });
            return;
          }
          inventoryItems = updatedInventory.reduce((acc, item) => {
            acc[item.item_name] = item.quantity;
            return acc;
          }, {});

          const updatedConsumableOptions = shopConsumables.reduce((options, item) => {
            if (inventoryItems[item.item_name] > 0) {
              options.push({ label: `${item.item_name} (${inventoryItems[item.item_name]})`, value: `item_${item.item_name}` });
            }
            return options;
          }, []);
          if (!updatedConsumableOptions.length) {
            updatedConsumableOptions.push({ label: 'No consumables available', value: 'item_none', description: 'Purchase consumables from the shop!' });
          }
          consumableMenu.setOptions(updatedConsumableOptions.slice(0, 25)).setDisabled(updatedConsumableOptions[0].value === 'item_none');

          const { data: item } = await supabase
            .from('shop_consumables')
            .select('stats')
            .eq('item_name', itemName)
            .single();

          if (!item) {
            actionResult = `Error: ${itemName} not found in shop_consumables.`;
            consumableMenu.setDisabled(false);
            await i.editReply({ embeds: [combatEmbed.setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)], components: [buttons, skillRow, consumableRow] });
            return;
          }

          let effectApplied = false;
          let effectMessage = '';
          if (item.stats?.health && tempPlayerHealth < player.health) {
            tempPlayerHealth = Math.min(player.health, tempPlayerHealth + item.stats.health);
            effectApplied = true;
            effectMessage += `Restored ${item.stats.health} health (current: ${tempPlayerHealth}/${player.health}). `;
          } else if (item.stats?.health) {
            effectMessage += `Health already at max (${player.health}). `;
          }

          if (item.stats?.strength && tempStats.strength < playerStats.strength) {
            tempStats.strength = Math.min(playerStats.strength, tempStats.strength + item.stats.strength);
            effectApplied = true;
            effectMessage += `Gained ${item.stats.strength} strength (current: ${tempStats.strength}/${playerStats.strength}). `;
          } else if (item.stats?.strength) {
            effectMessage += `Strength already at max (${playerStats.strength}). `;
          }

          if (!effectApplied) {
            actionResult = `Cannot use ${itemName}: all affected stats are at their maximum!`;
            consumableMenu.setDisabled(false);
            await i.editReply({ embeds: [combatEmbed.setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)], components: [buttons, skillRow, consumableRow] });
            return;
          }

          actionResult = `Used ${itemName}! ${effectMessage}`;
          consumableMenu.setDisabled(false);
        } else if (i.customId === 'flee') {
          const { error } = await supabase
            .from('users')
            .update({ skill_cooldowns: {} })
            .eq('discord_id', user.id);
          if (error) console.error('Error resetting cooldowns on flee:', error);

          const fleeEmbed = new EmbedBuilder()
            .setColor('#808080')
            .setTitle('🏃 Fled from Trial')
            .setDescription(`You fled from the battle! All skill cooldowns have been reset.`)
            .setFooter({ text: 'Dungeon Adventure' });
          await i.editReply({ embeds: [fleeEmbed], components: [] });
          collector.stop();
          return;
        }

        monsterHealth = Math.max(0, monsterHealth - damageToMonster);
        tempPlayerHealth = Math.max(0, tempPlayerHealth - damageToPlayer);

        const updatedSkillOptions = (player.skills || []).reduce((options, skill, index) => {
          if (!cooldowns[skill] || cooldowns[skill] <= 0) {
            options.push({ label: skill, value: `skill_${index}` });
          }
          return options;
        }, []);
        if (!updatedSkillOptions.length) {
          updatedSkillOptions.push({ label: 'No skills available', value: 'skill_none', description: 'Learn skills or wait for cooldowns!' });
        }
        skillMenu.setOptions(updatedSkillOptions.slice(0, 25)).setDisabled(updatedSkillOptions[0].value === 'skill_none');

        const updatedEmbed = new EmbedBuilder()
          .setColor('#FF4500')
          .setTitle(`⚔️ Trial: ${monster.name}`)
          .setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)
          .setFooter({ text: 'Dungeon Adventure' });

        if (monsterHealth <= 0) {
          const newGold = player.gold + monster.rewards.gold;
          const { error: updateError } = await supabase
            .from('users')
            .update({ gold: newGold })
            .eq('discord_id', user.id);
          if (updateError) console.error('Error updating gold:', updateError);

          const { error: trialError } = await supabase
            .from('trials')
            .insert({
              floor: monster.floor,
              participants: [{ discord_id: user.id, username: player.username }],
              status: 'completed',
              created_at: new Date().toISOString(),
            });
          if (trialError) console.error('Error inserting trial record:', trialError);

          const { error: cooldownError } = await supabase
            .from('users')
            .update({ skill_cooldowns: {} })
            .eq('discord_id', user.id);
          if (cooldownError) console.error省委('Error resetting cooldowns on victory:', cooldownError);

          const winEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle(`🏆 Victory over ${monster.name}!`)
            .setDescription(`You defeated the trial boss! Gained 💰 ${monster.rewards.gold} gold!\nNew balance: 💰 ${newGold}\nAll skill cooldowns have been reset.`)
            .setFooter({ text: 'Dungeon Adventure' });
          await i.editReply({ embeds: [winEmbed], components: [] });
          collector.stop();
          return;
        } else if (tempPlayerHealth <= 0) {
          const { error: cooldownError } = await supabase
            .from('users')
            .update({ skill_cooldowns: {} })
            .eq('discord_id', user.id);
          if (cooldownError) console.error('Error resetting cooldowns on defeat:', cooldownError);

          const loseEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('💀 Defeated')
            .setDescription(`You were defeated by the trial boss! All skill cooldowns have been reset.`)
            .setFooter({ text: 'Dungeon Adventure' });
          await i.editReply({ embeds: [loseEmbed], components: [] });
          collector.stop();
          return;
        }

        await i.editReply({ embeds: [updatedEmbed], components: [buttons, skillRow, consumableRow] });
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          const { error } = await supabase
            .from('users')
            .update({ skill_cooldowns: {} })
            .eq('discord_id', user.id);
          if (error) console.error('Error resetting cooldowns on timeout:', error);

          const timeoutEmbed = new EmbedBuilder()
            .setColor('#808080')
            .setTitle('⌛ Trial Timed Out')
            .setDescription('The trial has ended due to inactivity. All skill cooldowns have been reset.')
            .setFooter({ text: 'Dungeon Adventure' });
          await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
        }
      });

    } catch (error) {
      console.error('Error in called:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Error')
        .setDescription('An error occurred during the trial.')
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};