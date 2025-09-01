const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reminder')
    .setDescription('Set a reminder for an enemy spell in Mobile Legends')
    .addStringOption(option =>
      option
        .setName('hero')
        .setDescription('The enemy hero using the spell')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply();

    const hero = interaction.options.getString('hero');
    if (!hero || hero.trim().length === 0) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Invalid Input')
        .setDescription('Please provide a valid enemy hero name.')
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    const spellSelect = new StringSelectMenuBuilder()
      .setCustomId('spell_select')
      .setPlaceholder('Select an enemy spell')
      .addOptions(
        { label: 'Execute', value: 'execute', description: 'Cooldown: 90s' },
        { label: 'Retribution', value: 'retribution', description: 'Cooldown: 35s' },
        { label: 'Inspire', value: 'inspire', description: 'Cooldown: 75s' },
        { label: 'Sprint', value: 'sprint', description: 'Cooldown: 100s' },
        { label: 'Revitalize', value: 'revitalize', description: 'Cooldown: 75s' },
        { label: 'Aegis', value: 'aegis', description: 'Cooldown: 75s' },
        { label: 'Petrify', value: 'petrify', description: 'Cooldown: 75s' },
        { label: 'Purify', value: 'purify', description: 'Cooldown: 90s' },
        { label: 'Flameshot', value: 'flameshot', description: 'Cooldown: 50s' },
        { label: 'Flicker', value: 'flicker', description: 'Cooldown: 120s' },
        { label: 'Arrival', value: 'arrival', description: 'Cooldown: 75s' },
        { label: 'Vengeance', value: 'vengeance', description: 'Cooldown: 75s' }
      );

    const row = new ActionRowBuilder()
      .addComponents(spellSelect);

    const initialEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('⏰ Set Reminder')
      .setDescription(`Select an enemy spell for ${hero.toLowerCase()}. Reminder will trigger based on the spell’s cooldown.`)
      .setFooter({ text: 'Dungeon Adventure' });

    const message = await interaction.editReply({
      embeds: [initialEmbed],
      components: [row]
    });

    const filter = i => i.customId === 'spell_select' && i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
      const selectedSpell = i.values[0];
      const cooldowns = {
        execute: 90,
        retribution: 35,
        inspire: 75,
        sprint: 100,
        revitalize: 75,
        aegis: 75,
        petrify: 75,
        purify: 90,
        flameshot: 50,
        flicker: 120,
        arrival: 75,
        vengeance: 75
      };
      const delaySeconds = cooldowns[selectedSpell];

      await i.update({
        components: [],
        embeds: [new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('⏰ Reminder Set!')
          .setDescription(`Reminder set for ${hero.toLowerCase()}'s ${selectedSpell} (Cooldown: ${delaySeconds}s). Await the notification!`)
          .setFooter({ text: 'Dungeon Adventure' })
        ]
      });

      setTimeout(async () => {
        const reminderEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('⏰ Reminder')
          .setDescription(`<@${interaction.user.id}>, ${hero} can use ${selectedSpell} again!`)
          .setFooter({ text: 'Dungeon Adventure' });

        await interaction.channel.send({ embeds: [reminderEmbed] });
      }, delaySeconds * 1000);
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.editReply({ components: [], embeds: [new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('⏰ Reminder Closed!')
          .setDescription('No spell selected within 60 seconds. Reminder cancelled.')
          .setFooter({ text: 'Dungeon Adventure' })
        ]});
      }
    });
  }
};