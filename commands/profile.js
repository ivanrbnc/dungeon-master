const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkRegistration } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your character profile.'),
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
        .select('health, strength, defense, agility, intelligence, equipped_armor, equipped_weapons, skills, gold, skill_cooldowns, xp, level')
        .eq('discord_id', user.id)
        .single();

      if (playerError || !player) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Error')
          .setDescription('Error fetching your profile.')
          .setFooter({ text: 'Dungeon Adventure' });
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const xpToNextLevel = player.level * 50 + 50; // 100 XP for level 2, 150 for level 3, etc.
      const profileEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`👤 ${user.username}'s Profile`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          // First row: Level and XP
          { name: '🧬 Level', value: `${player.level}`, inline: true },
          { name: '📈 XP', value: `${player.xp}/${xpToNextLevel}`, inline: true },
          { name: '\u200B', value: '\u200B', inline: true } // Spacer for 3-field row
        )
        .addFields(
          // Second row: Health, Strength, Defense
          { name: '❤️ Health', value: `${player.health}`, inline: true },
          { name: '💪 Strength', value: `${player.strength}`, inline: true },
          { name: '🛡️ Defense', value: `${player.defense}`, inline: true }
        )
        .addFields(
          // Third row: Agility, Intelligence
          { name: '⚡ Agility', value: `${player.agility}`, inline: true },
          { name: '🧠 Intelligence', value: `${player.intelligence}`, inline: true },
          { name: '\u200B', value: '\u200B', inline: true } // Spacer for 3-field row
        )
        .addFields(
          // Fourth row: Gold
          { name: '💰 Gold', value: `${player.gold || 0}`, inline: true },
          { name: '\u200B', value: '\u200B', inline: true }, // Spacer
          { name: '\u200B', value: '\u200B', inline: true } // Spacer
        )
        .addFields({
          // Fifth row: Armor
          name: '🛡️ Armor',
          value: `Helmet: ${player.equipped_armor.helmet?.name || 'None'}\nChestplate: ${player.equipped_armor.chestplate?.name || 'None'}\nLeggings: ${player.equipped_armor.leggings?.name || 'None'}\nBoots: ${player.equipped_armor.boots?.name || 'None'}`,
          inline: false
        })
        .addFields({
          // Sixth row: Weapons
          name: '⚔️ Weapons',
          value: `Mainhand: ${player.equipped_weapons.mainhand?.name || 'None'}\nOffhand: ${player.equipped_weapons.offhand?.name || 'None'}`,
          inline: false
        })
        .addFields({
          // Seventh row: Learned Skills
          name: '📚 Learned Skills',
          value: (player.skills || []).length > 0 ? player.skills.map(skill => {
            const cooldown = player.skill_cooldowns[skill] || 0;
            return `${skill} ${cooldown > 0 ? `(Cooldown: ${cooldown} actions)` : ''}`;
          }).join(', ') : 'None',
          inline: false
        })
        .setFooter({ text: 'Dungeon Adventure' });

      await interaction.editReply({ embeds: [profileEmbed] });

    } catch (error) {
      console.error('Error in profile command:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Error')
        .setDescription('An error occurred while fetching your profile.')
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};