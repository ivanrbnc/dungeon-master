const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { checkRegistration } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('casino')
    .setDescription('Gamble your gold with a 50% chance to double your bet'),
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
        .select('gold')
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

      if (player.gold <= 0) {
        const noGoldEmbed = new EmbedBuilder()
          .setColor('#FF4500')
          .setTitle('🚫 No Gold')
          .setDescription('You need gold to gamble at the casino!')
          .setFooter({ text: 'Dungeon Adventure' });
        await interaction.editReply({ embeds: [noGoldEmbed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🎰 Casino')
        .setDescription(`Current Gold: 💰 ${player.gold}\nChoose how much to bet (50% win chance, 2x payout).`)
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: 'Dungeon Adventure' });

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('bet_100')
          .setLabel('All In (100%)')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('bet_50')
          .setLabel('50%')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('bet_25')
          .setLabel('25%')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('bet_10')
          .setLabel('10%')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('bet_custom')
          .setLabel('Custom')
          .setStyle(ButtonStyle.Secondary)
      );

      const message = await interaction.editReply({ embeds: [embed], components: [buttons] });

      const filter = i => i.customId.startsWith('bet_') && i.user.id === user.id;
      const collector = message.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async i => {
        let betAmount;
        if (i.customId === 'bet_custom') {
          const modal = new ModalBuilder()
            .setCustomId('bet_modal')
            .setTitle('Custom Bet Amount')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('bet_input')
                  .setLabel('Enter bet amount')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('Enter a number')
                  .setRequired(true)
              )
            );

          await i.showModal(modal);

          const modalFilter = m => m.customId === 'bet_modal' && m.user.id === user.id;
          try {
            const modalInteraction = await i.awaitModalSubmit({ filter: modalFilter, time: 30000 });
            const input = modalInteraction.fields.getTextInputValue('bet_input');
            betAmount = parseInt(input);

            if (isNaN(betAmount) || betAmount <= 0 || betAmount > player.gold) {
              const invalidEmbed = new EmbedBuilder()
                .setColor('#FF4500')
                .setTitle('🚫 Invalid Bet')
                .setDescription(`Please enter a valid bet amount (1 to ${player.gold} gold).`)
                .setFooter({ text: 'Dungeon Adventure' });
              await modalInteraction.reply({ embeds: [invalidEmbed], ephemeral: true });
              return;
            }

            await modalInteraction.deferUpdate();
          } catch (error) {
            console.error('Error in modal submission:', error);
            const timeoutEmbed = new EmbedBuilder()
              .setColor('#808080')
              .setTitle('⌛ Input Timed Out')
              .setDescription('You did not enter a bet amount in time.')
              .setFooter({ text: 'Dungeon Adventure' });
            await i.editReply({ embeds: [timeoutEmbed], components: [] });
            collector.stop();
            return;
          }
        } else {
          await i.deferUpdate();
          const percentage = parseInt(i.customId.replace('bet_', ''));
          betAmount = Math.floor((percentage / 100) * player.gold);
        }

        if (betAmount <= 0) {
          const invalidEmbed = new EmbedBuilder()
            .setColor('#FF4500')
            .setTitle('🚫 Invalid Bet')
            .setDescription('You need at least 1 gold to bet.')
            .setFooter({ text: 'Dungeon Adventure' });
          await i.editReply({ embeds: [invalidEmbed], components: [] });
          collector.stop();
          return;
        }

        const win = Math.random() < 0.5;
        const newGold = win ? player.gold + betAmount : player.gold - betAmount;

        const { error: updateError } = await supabase
          .from('users')
          .update({ gold: newGold })
          .eq('discord_id', user.id);

        if (updateError) {
          console.error('Error updating user data:', updateError);
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Error')
            .setDescription('Failed to process your bet.')
            .setFooter({ text: 'Dungeon Adventure' });
          await i.editReply({ embeds: [errorEmbed], components: [] });
          return;
        }

        const resultEmbed = new EmbedBuilder()
          .setColor(win ? '#00FF00' : '#FF4500')
          .setTitle(win ? '🎉 Casino Win!' : '😞 Casino Loss')
          .setDescription(
            win
              ? `You won! Your bet of 💰 ${betAmount} was doubled!\nNew balance: 💰 ${newGold}`
              : `You lost your bet of 💰 ${betAmount}.\nNew balance: 💰 ${newGold}`
          )
          .setFooter({ text: 'Dungeon Adventure' });

        await i.editReply({ embeds: [resultEmbed], components: [] });
        collector.stop();
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          const timeoutEmbed = new EmbedBuilder()
            .setColor('#808080')
            .setTitle('⌛ Casino Timed Out')
            .setDescription('You did not place a bet in time.')
            .setFooter({ text: 'Dungeon Adventure' });
          await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
        }
      });

    } catch (error) {
      console.error('Error in casino command:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Error')
        .setDescription('An error occurred while processing the casino command.')
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};