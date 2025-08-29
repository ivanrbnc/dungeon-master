// combat.js - Handle combat with cooldown reduction
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { checkRegistration } = require('../utils');

module.exports = async (interaction, supabase) => {
  await interaction.deferReply({ ephemeral: true });

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
      .select('health, skill_cooldowns')
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

    const combatEmbed = new EmbedBuilder()
      .setColor('#FF4500')
      .setTitle('⚔️ Combat Mode')
      .setDescription(`Health: ❤️ ${player.health}\nSpamming buttons to fight! Use skills from /inventory when ready.`)
      .setFooter({ text: 'Dungeon Adventure' });

    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('attack').setLabel('Attack').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('defend').setLabel('Defend').setStyle(ButtonStyle.Secondary)
      );

    const message = await interaction.editReply({ embeds: [combatEmbed], components: [buttons] });

    const filter = i => (i.customId === 'attack' || i.customId === 'defend') && i.user.id === user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 300000 }); // 5 min combat session

    collector.on('collect', async i => {
      await i.deferUpdate();

      // Reduce cooldowns for non-skill actions
      const cooldowns = player.skill_cooldowns || {};
      let updatedCooldowns = { ...cooldowns };
      let changed = false;

      for (const skill in cooldowns) {
        if (cooldowns[skill] > 0) {
          updatedCooldowns[skill] = Math.max(0, cooldowns[skill] - 1);
          changed = true;
        }
      }

      if (changed) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ skill_cooldowns: updatedCooldowns })
          .eq('discord_id', user.id);

        if (updateError) {
          console.error('Error updating cooldowns:', updateError);
        }
      }

      // Mock combat action (e.g., reduce health or log damage)
      const newHealth = Math.max(1, player.health - 5); // Example: 5 damage per action
      const { error: healthError } = await supabase
        .from('users')
        .update({ health: newHealth })
        .eq('discord_id', user.id);

      if (healthError) {
        console.error('Error updating health:', healthError);
      }

      const updatedEmbed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('⚔️ Combat Mode')
        .setDescription(`Health: ❤️ ${newHealth}\nAction: ${i.customId === 'attack' ? 'Attacked!' : 'Defended!'}`)
        .setFooter({ text: 'Dungeon Adventure' });

      await i.editReply({ embeds: [updatedEmbed], components: [buttons] });

      if (newHealth <= 0) {
        await i.followUp({ content: '💀 You have been defeated!', ephemeral: true });
        collector.stop();
      }
    });

    collector.on('end', async () => {
      await interaction.editReply({ embeds: [combatEmbed], components: [] });
    });

  } catch (error) {
    console.error('Error in combat command:', error);
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Error')
      .setDescription('An error occurred in combat.')
      .setFooter({ text: 'Dungeon Adventure' });
    await interaction.editReply({ embeds: [errorEmbed] });
  }
};