const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
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
      const [{ data: player }, { data: monsters }, { data: shopConsumables }, { data: inventory }, { data: trialRecord }] = await Promise.all([
        supabase
          .from('users')
          .select('health, strength, intelligence, defense, agility, equipped_armor, equipped_weapons, skills, skill_cooldowns, gold, username, xp, level')
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
          .eq('item_type', 'consumable'),
        supabase
          .from('trials')
          .select('floor')
          .eq('discord_id', user.id)
          .single()
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

      const maxFloor = trialRecord?.floor || 0;
      const maxSelectableFloor = maxFloor + 1;
      const floorButtons = [];
      for (let i = 1; i <= 10; i++) {
        floorButtons.push(
          new ButtonBuilder()
            .setCustomId(`floor_${i}`)
            .setLabel(`Floor ${i}`)
            .setStyle(i <= maxSelectableFloor ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(i > maxSelectableFloor)
        );
      }

      const floorRows = [];
      for (let i = 0; i < floorButtons.length; i += 5) {
        floorRows.push(new ActionRowBuilder().addComponents(floorButtons.slice(i, i + 5)));
      }

      const floorEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏰 Select a Trial Floor')
        .setDescription(`Choose a floor to challenge (up to Floor ${maxSelectableFloor}).\nYour highest completed floor: ${maxFloor || 'None'}.`)
        .setFooter({ text: 'Dungeon Adventure' });

      const floorMessage = await interaction.editReply({
        embeds: [floorEmbed],
        components: floorRows
      });

      const floorFilter = i => i.customId.startsWith('floor_') && i.user.id === user.id;
      const floorCollector = floorMessage.createMessageComponentCollector({ filter: floorFilter, time: 60000 });

      floorCollector.on('collect', async i => {
        await i.deferUpdate();
        floorCollector.stop();

        const selectedFloor = parseInt(i.customId.replace('floor_', ''));
        const eligibleMonsters = monsters.filter(m => m.floor === selectedFloor);
        const monster = eligibleMonsters.length > 0
          ? eligibleMonsters[Math.floor(Math.random() * eligibleMonsters.length)]
          : monsters[Math.floor(Math.random() * monsters.length)]; // Fallback
        let monsterHealth = monster.health;

        // Update monster rewards with XP
        const xpReward = monster.name === 'Dragon Overlord' ? 250 : monster.floor * 10 + 10;
        monster.rewards = { ...monster.rewards, xp: xpReward };

        let tempPlayerHealth = player.health;
        let tempStats = {
          strength: player.strength || 0,
          intelligence: player.intelligence || 0,
          defense: player.defense || 0,
          agility: player.agility || 0,
        };
        let cooldowns = { ...player.skill_cooldowns };
        let inventoryItems = inventory.reduce((acc, item) => {
          acc[item.item_name] = item.quantity;
          return acc;
        }, {});

        const combatEmbed = new EmbedBuilder()
          .setColor('#FF4500')
          .setTitle(`⚔️ Trial: ${monster.name} (Floor ${selectedFloor})`)
          .setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\nChoose your action!`)
          .setFooter({ text: 'Dungeon Adventure' });

        const skillOptions = (player.skills || []).reduce((options, skill, index) => {
          if (!cooldowns[skill] || cooldowns[skill] <= 0) {
            options.push({ label: skill, value: `skill_${index}` });
          }
          return options;
        }, []);

        const skillMenu = new StringSelectMenuBuilder()
          .setCustomId('select_skill')
          .setPlaceholder('Use a skill...')
          .setDisabled(!skillOptions.length)
          .addOptions(skillOptions.length ? skillOptions.slice(0, 25) : [{ label: 'No skills available', value: 'skill_none', description: 'Learn skills to use them!' }]);

        const consumableOptions = shopConsumables.reduce((options, item) => {
          if (inventoryItems[item.item_name] > 0) {
            options.push({ label: `${item.item_name} (${inventoryItems[item.item_name]})`, value: `item_${item.item_name}` });
          }
          return options;
        }, []);

        const consumableMenu = new StringSelectMenuBuilder()
          .setCustomId('select_consumable')
          .setPlaceholder('Use a consumable...')
          .setDisabled(!consumableOptions.length)
          .addOptions(consumableOptions.length ? consumableOptions.slice(0, 25) : [{ label: 'No consumables available', value: 'item_none', description: 'Purchase or find consumables!' }]);

        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder().setCustomId('attack').setLabel('Attack').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('flee').setLabel('Flee').setStyle(ButtonStyle.Danger)
          );
        const skillRow = new ActionRowBuilder().addComponents(skillMenu);
        const consumableRow = new ActionRowBuilder().addComponents(consumableMenu);

        const combatMessage = await i.editReply({
          embeds: [combatEmbed],
          components: [buttons, skillRow, consumableRow]
        });

        const filter = i => (i.customId === 'attack' || i.customId === 'flee' || i.customId === 'select_skill' || i.customId === 'select_consumable') && i.user.id === user.id;
        const collector = combatMessage.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async i => {
          await i.deferUpdate();
          collector.resetTimer({ time: 300000 });

          consumableMenu.setDisabled(!consumableOptions.length);
          skillMenu.setDisabled(!skillOptions.length);
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
            damageToMonster = Math.max(1, Math.floor(tempStats.strength * (1 + tempStats.agility / 100)));
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
              skillMenu.setOptions(updatedSkillOptions.length ? updatedSkillOptions.slice(0, 25) : [{ label: 'No skills available', value: 'skill_none', description: 'Learn skills to use them!' }])
                .setDisabled(!updatedSkillOptions.length);
              await i.editReply({ embeds: [combatEmbed.setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)], components: [buttons, skillRow, consumableRow] });
              return;
            }

            let skill = await supabase
              .from('shop_skills')
              .select('effect_scale, cooldown')
              .eq('item_name', skillName)
              .order('effect_scale', { ascending: false })
              .limit(1)
              .single();

            if (!skill.data) {
              skill = await supabase
                .from('unique_items')
                .select('effect_scale, cooldown')
                .eq('item_name', skillName)
                .eq('item_type', 'skill')
                .single();
            }

            if (skill.data) {
              damageToMonster = Math.max(1, Math.floor(tempStats.intelligence * (100 + skill.data.effect_scale) / 100));
              damageToPlayer = Math.max(1, monster.strength - Math.floor(tempStats.defense * 0.5));
              cooldowns[skillName] = skill.data.cooldown || 3;
              const { error } = await supabase
                .from('users')
                .update({ skill_cooldowns: cooldowns })
                .eq('discord_id', user.id);
              if (error) console.error('Error setting cooldown:', error);
              actionResult = `Used ${skillName} for ${damageToMonster} damage! Monster deals ${damageToPlayer} damage.`;
            } else {
              console.error(`Skill ${skillName} not found in shop_skills or unique_items.`);
              actionResult = `Error: ${skillName} not found.`;
              damageToMonster = 0;
              const updatedSkillOptions = (player.skills || []).reduce((options, skill, index) => {
                if (!cooldowns[skill] || cooldowns[skill] <= 0) {
                  options.push({ label: skill, value: `skill_${index}` });
                }
                return options;
              }, []);
              skillMenu.setOptions(updatedSkillOptions.length ? updatedSkillOptions.slice(0, 25) : [{ label: 'No skills available', value: 'skill_none', description: 'Learn skills to use them!' }])
                .setDisabled(!updatedSkillOptions.length);
              await i.editReply({ embeds: [combatEmbed.setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)], components: [buttons, skillRow, consumableRow] });
              return;
            }
          } else if (i.customId === 'select_consumable') {
            if (i.values[0] === 'item_none') {
              consumableMenu.setDisabled(!consumableOptions.length);
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
              consumableMenu.setOptions(updatedConsumableOptions.length ? updatedConsumableOptions.slice(0, 25) : [{ label: 'No consumables available', value: 'item_none', description: 'Purchase or find consumables!' }])
                .setDisabled(!updatedConsumableOptions.length);
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
              consumableMenu.setOptions(updatedConsumableOptions.length ? updatedConsumableOptions.slice(0, 25) : [{ label: 'No consumables available', value: 'item_none', description: 'Purchase or find consumables!' }])
                .setDisabled(!updatedConsumableOptions.length);
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
              consumableMenu.setDisabled(!consumableOptions.length);
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
            consumableMenu.setOptions(updatedConsumableOptions.length ? updatedConsumableOptions.slice(0, 25) : [{ label: 'No consumables available', value: 'item_none', description: 'Purchase or find consumables!' }])
              .setDisabled(!updatedConsumableOptions.length);

            let item = await supabase
              .from('shop_consumables')
              .select('stats')
              .eq('item_name', itemName)
              .single();

            if (!item.data) {
              item = await supabase
                .from('unique_items')
                .select('stats')
                .eq('item_name', itemName)
                .eq('item_type', 'consumable')
                .single();
            }

            if (!item.data) {
              actionResult = `Error: ${itemName} not found in shop_consumables or unique_items.`;
              consumableMenu.setDisabled(!consumableOptions.length);
              await i.editReply({ embeds: [combatEmbed.setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)], components: [buttons, skillRow, consumableRow] });
              return;
            }

            let effectApplied = false;
            let effectMessage = '';
            if (item.data.stats?.health && tempPlayerHealth < player.health) {
              tempPlayerHealth = Math.min(player.health, tempPlayerHealth + item.data.stats.health);
              effectApplied = true;
              effectMessage += `Restored ${item.data.stats.health} health (current: ${tempPlayerHealth}/${player.health}). `;
            } else if (item.data.stats?.health) {
              effectMessage += `Health already at max (${player.health}). `;
            }

            if (item.data.stats?.strength) {
              tempStats.strength += item.data.stats.strength;
              effectApplied = true;
              effectMessage += `Gained ${item.data.stats.strength} strength (current: ${tempStats.strength}). `;
            }

            if (item.data.stats?.agility) {
              tempStats.agility += item.data.stats.agility;
              effectApplied = true;
              effectMessage += `Gained ${item.data.stats.agility} agility (current: ${tempStats.agility}). `;
            }

            if (item.data.stats?.defense) {
              tempStats.defense += item.data.stats.defense;
              effectApplied = true;
              effectMessage += `Gained ${item.data.stats.defense} defense (current: ${tempStats.defense}). `;
            }

            if (item.data.stats?.intelligence) {
              tempStats.intelligence += item.data.stats.intelligence;
              effectApplied = true;
              effectMessage += `Gained ${item.data.stats.intelligence} intelligence (current: ${tempStats.intelligence}). `;
            }

            if (!effectApplied) {
              actionResult = `Cannot use ${itemName}: no effects to apply!`;
              consumableMenu.setDisabled(!consumableOptions.length);
              await i.editReply({ embeds: [combatEmbed.setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)], components: [buttons, skillRow, consumableRow] });
              return;
            }

            actionResult = `Used ${itemName}! ${effectMessage}`;
            consumableMenu.setDisabled(!consumableOptions.length);
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
          skillMenu.setOptions(updatedSkillOptions.length ? updatedSkillOptions.slice(0, 25) : [{ label: 'No skills available', value: 'skill_none', description: 'Learn skills to use them!' }])
            .setDisabled(!updatedSkillOptions.length);

          const updatedEmbed = new EmbedBuilder()
            .setColor('#FF4500')
            .setTitle(`⚔️ Trial: ${monster.name} (Floor ${selectedFloor})`)
            .setDescription(`Your Health: ❤️ ${tempPlayerHealth}\nMonster Health: 🖤 ${monsterHealth}\n${actionResult}`)
            .setFooter({ text: 'Dungeon Adventure' });

          if (monsterHealth <= 0) {
            let newXp = player.xp + monster.rewards.xp;
            let newLevel = player.level;
            let levelUpMessage = '';
            let newHealth = player.health;
            let newStrength = player.strength;
            let newDefense = player.defense;
            let newAgility = player.agility;
            let newIntelligence = player.intelligence;

            while (newXp >= (newLevel * 50 + 50)) {
              newXp -= (newLevel * 50 + 50);
              newLevel += 1;
              newHealth += 5;
              newStrength += 5;
              newDefense += 5;
              newAgility += 5;
              newIntelligence += 5;
              levelUpMessage += `\nCongratulations! You leveled up to Level ${newLevel}! All stats +5.`;
            }

            const newGold = player.gold + monster.rewards.gold;

            let dropMessage = '';
            const droppedItems = [];
            if (monster.rewards.items && monster.rewards.items.length > 0) {
              for (const drop of monster.rewards.items) {
                if (Math.random() <= drop.drop_chance) {
                  let itemType = null;
                  let itemStats = null;
                  let itemSlot = null;
                  let effectScale = null;
                  let cooldown = null;

                  let itemDetails = await supabase
                    .from('shop_weapons')
                    .select('stats, slot')
                    .eq('item_name', drop.item_name)
                    .single();
                  if (itemDetails.data) {
                    itemType = 'weapon';
                    itemStats = itemDetails.data.stats;
                    itemSlot = itemDetails.data.slot;
                  } else {
                    itemDetails = await supabase
                      .from('shop_armors')
                      .select('stats, slot')
                      .eq('item_name', drop.item_name)
                      .single();
                    if (itemDetails.data) {
                      itemType = 'armor';
                      itemStats = itemDetails.data.stats;
                      itemSlot = itemDetails.data.slot;
                    } else {
                      itemDetails = await supabase
                        .from('shop_skills')
                        .select('effect_scale, cooldown')
                        .eq('item_name', drop.item_name)
                        .single();
                      if (itemDetails.data) {
                        itemType = 'skill';
                        effectScale = itemDetails.data.effect_scale;
                        cooldown = itemDetails.data.cooldown;
                      } else {
                        itemDetails = await supabase
                          .from('shop_consumables')
                          .select('stats')
                          .eq('item_name', drop.item_name)
                          .single();
                        if (itemDetails.data) {
                          itemType = 'consumable';
                          itemStats = itemDetails.data.stats;
                        } else {
                          itemDetails = await supabase
                            .from('unique_items')
                            .select('item_type, stats, slot, effect_scale, cooldown')
                            .eq('item_name', drop.item_name)
                            .single();
                          if (itemDetails.data) {
                            itemType = itemDetails.data.item_type;
                            itemStats = itemDetails.data.stats;
                            itemSlot = itemDetails.data.slot;
                            effectScale = itemDetails.data.effect_scale;
                            cooldown = itemDetails.data.cooldown;
                          }
                        }
                      }
                    }
                  }

                  if (itemType) {
                    const { data: existingItem, error: checkError } = await supabase
                      .from('inventory')
                      .select('id, quantity')
                      .eq('discord_id', user.id)
                      .eq('item_name', drop.item_name)
                      .eq('item_type', itemType)
                      .single();

                    if (existingItem) {
                      const { error: updateError } = await supabase
                        .from('inventory')
                        .update({ quantity: existingItem.quantity + 1 })
                        .eq('id', existingItem.id);
                      if (updateError) console.error('Error updating inventory quantity:', updateError);
                    } else {
                      const { error: insertError } = await supabase
                        .from('inventory')
                        .insert({
                          discord_id: user.id,
                          item_type: itemType,
                          item_name: drop.item_name,
                          slot: itemSlot,
                          stats: itemStats,
                          quantity: 1
                        });
                      if (insertError) console.error('Error inserting dropped item:', insertError);
                    }
                    droppedItems.push({ name: drop.item_name, type: itemType });
                  } else {
                    console.error(`Dropped item ${drop.item_name} not found in shops or unique_items.`);
                  }
                }
              }
              if (droppedItems.length > 0) {
                dropMessage = `\nDropped: ${droppedItems.map(item => `${item.name} (${item.type})`).join(', ')}`;
              }
            }

            if (selectedFloor > maxFloor) {
              const { error: trialError } = await supabase
                .from('trials')
                .upsert({
                  discord_id: user.id,
                  floor: selectedFloor
                }, { onConflict: 'discord_id' });
              if (trialError) console.error('Error updating trial record:', trialError);
            }

            const { error: updateError } = await supabase
              .from('users')
              .update({
                gold: newGold,
                xp: newXp,
                level: newLevel,
                health: newHealth,
                strength: newStrength,
                defense: newDefense,
                agility: newAgility,
                intelligence: newIntelligence,
                skill_cooldowns: {}
              })
              .eq('discord_id', user.id);
            if (updateError) console.error('Error updating user stats:', updateError);

            const winEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle(`🏆 Victory over ${monster.name}!`)
              .setDescription(`You defeated the trial boss on Floor ${selectedFloor}! Gained 💰 ${monster.rewards.gold} gold and 🧬 ${monster.rewards.xp} XP!${dropMessage}\nNew balance: 💰 ${newGold}\nNew XP: 🧬 ${newXp}/${newLevel * 50 + 50}\nLevel: ${newLevel}${levelUpMessage}\nAll skill cooldowns have been reset.`)
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
              .setDescription(`You were defeated by the trial boss on Floor ${selectedFloor}! All skill cooldowns have been reset.`)
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
              .setDescription(`The trial on Floor ${selectedFloor} has ended due to inactivity. All skill cooldowns have been reset.`)
              .setFooter({ text: 'Dungeon Adventure' });
            await i.editReply({ embeds: [timeoutEmbed], components: [] });
          }
        });
      });

      floorCollector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          const timeoutEmbed = new EmbedBuilder()
            .setColor('#808080')
            .setTitle('⌛ Floor Selection Timed Out')
            .setDescription('You did not select a floor in time.')
            .setFooter({ text: 'Dungeon Adventure' });
          await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
        }
      });

    } catch (error) {
      console.error('Error in trial:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Error')
        .setDescription('An error occurred during the trial.')
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};