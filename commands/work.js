const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { checkRegistration } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work to earn gold through various activities'),
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
        .select('gold, cooldowns')
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

      const now = new Date();
      const cooldowns = player.cooldowns || {};
      const workCooldownEnd = cooldowns.work;
      if (workCooldownEnd && new Date(workCooldownEnd) > now) {
        const cooldownEmbed = new EmbedBuilder()
          .setColor('#FF4500')
          .setTitle('⏳ Work Cooldown')
          .setDescription(`You can't work again until ${new Date(workCooldownEnd).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })}.`)
          .setFooter({ text: 'Dungeon Adventure' });
        await interaction.editReply({ embeds: [cooldownEmbed] });
        return;
      }

      const workOptions = [
        {
          label: 'Office Job',
          value: 'office',
          description: 'Earn 50-100 gold, 24-hour cooldown',
          goldMin: 50,
          goldMax: 100,
          cooldownHours: 24,
        },
        {
          label: 'Freelance Gig',
          value: 'freelance',
          description: 'Earn 20-50 gold, 6-hour cooldown',
          goldMin: 20,
          goldMax: 50,
          cooldownHours: 6,
        },
        {
          label: 'Begging',
          value: 'begging',
          description: 'Earn 5-15 gold, 1-hour cooldown',
          goldMin: 5,
          goldMax: 15,
          cooldownHours: 1,
        },
      ];

      const workMenu = new StringSelectMenuBuilder()
        .setCustomId('select_work')
        .setPlaceholder('Choose a work activity...')
        .addOptions(workOptions.map(option => ({
          label: option.label,
          value: option.value,
          description: option.description,
        })));

      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('💼 Work Opportunities')
        .setDescription(`Current Gold: 💰 ${player.gold}\nSelect a work activity to earn gold.`)
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: 'Dungeon Adventure' });

      const row = new ActionRowBuilder().addComponents(workMenu);
      const message = await interaction.editReply({ embeds: [embed], components: [row] });

      const filter = i => i.customId === 'select_work' && i.user.id === user.id;
      const collector = message.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async i => {
        await i.deferUpdate();
        collector.stop();

        const selectedValue = i.values[0];
        const selectedOption = workOptions.find(opt => opt.value === selectedValue);

        const goldEarned = Math.floor(Math.random() * (selectedOption.goldMax - selectedOption.goldMin + 1)) + selectedOption.goldMin;
        const newGold = player.gold + goldEarned;
        const newCooldowns = {
          ...cooldowns,
          work: new Date(Date.now() + selectedOption.cooldownHours * 60 * 60 * 1000).toISOString(),
        };

        const { error: updateError } = await supabase
          .from('users')
          .update({ gold: newGold, cooldowns: newCooldowns })
          .eq('discord_id', user.id);

        if (updateError) {
          console.error('Error updating user data:', updateError);
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Error')
            .setDescription('Failed to process work reward.')
            .setFooter({ text: 'Dungeon Adventure' });
          await i.editReply({ embeds: [errorEmbed], components: [] });
          return;
        }

        const successEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle(`✅ ${selectedOption.label} Completed`)
          .setDescription(`You earned 💰 ${goldEarned} gold!\nNew balance: 💰 ${newGold}\nWork on cooldown for ${selectedOption.cooldownHours} hours`)
          .setFooter({ text: 'Dungeon Adventure' });

        await i.editReply({ embeds: [successEmbed], components: [] });
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          const timeoutEmbed = new EmbedBuilder()
            .setColor('#808080')
            .setTitle('⌛ Work Selection Timed Out')
            .setDescription('You did not select a work activity in time.')
            .setFooter({ text: 'Dungeon Adventure' });
          await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
        }
      });

    } catch (error) {
      console.error('Error in work command:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Error')
        .setDescription('An error occurred while processing the work command.')
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};