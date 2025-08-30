// Updated register.js - Fixed export format and flags
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { checkRegistration } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register yourself as a new player in the dungeon'),
  
  async execute(interaction, supabase) {
    // await interaction.deferReply({ ephemeral: true });
    await interaction.deferReply();

    const { user } = interaction;

    // Check if already registered
    const isRegistered = await checkRegistration(interaction, supabase);
    if (isRegistered) {
      const embed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('🚫 Already Registered')
        .setDescription(`You're already registered, ${user.username}! Use \`/inventory\` to check your stats and items.`)
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Register new user
    console.log(`Registering new user: ${user.username} (${user.id})`);
    const { error: insertError } = await supabase.from('users').insert({
      discord_id: user.id,
      username: user.username,
      health: 100,
      strength: 10,
      defense: 10,
      agility: 10,
      intelligence: 10,
      gold: 0,
      equipped_armor: {},
      equipped_weapons: {},
      skills: [],
      skill_cooldowns: {} 
    });

    if (insertError) {
      console.error('Error inserting user:', insertError);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Registration Failed')
        .setDescription('Failed to register. Please try again or contact an administrator.')
        .setFooter({ text: 'Dungeon Adventure' });
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Gamey welcome embed
    const welcomeEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle(`🎉 Welcome to the Dungeon, ${user.username}! 🎉`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: '❤️ Health', value: '100', inline: true },
        { name: '💪 Strength', value: '10', inline: true },
        { name: '🛡️ Defense', value: '10', inline: true },
        { name: '⚡ Agility', value: '10', inline: true },
        { name: '🧠 Intelligence', value: '10', inline: true },
        { name: '💰 Gold', value: '0', inline: true },
        { name: '🛡️ Helmet', value: 'None', inline: true },
        { name: '🛡️ Chestplate', value: 'None', inline: true },
        { name: '🛡️ Leggings', value: 'None', inline: true },
        { name: '🛡️ Boots', value: 'None', inline: true },
        { name: '⚔️ Mainhand', value: 'None', inline: true },
        { name: '⚔️ Offhand', value: 'None', inline: true },
        { name: '📚 Skills', value: 'None', inline: false },
        { name: '🎒 Inventory', value: 'Empty', inline: false }
      )
      .setDescription('Your adventure begins now... Use `/inventory` to manage your gear!')
      .setFooter({ text: 'Dungeon Adventure | Page 1/1' });

    await interaction.editReply({ embeds: [welcomeEmbed] });
  }
};